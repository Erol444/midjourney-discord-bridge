const axios = require("axios");
const Discordie = require("discordie");
const fs = require("fs");
const { distance } = require('fastest-levenshtein');
const { match } = require("assert");

class MidjourneyDiscordBridge {
    /**
     * MidjourneyDiscordBridge - A class that interacts with Midjourney's Discord bot
     * 
     * @param {string} discord_token - Your discord token that has access to Midjourney bot
     * 
     * @param {number | string} guild_id - The server ID that the bot is in. Do not recommend using the Midjourney server. 
     * You can get this ID by right-clicking a server name and clicking "Copy Server ID" or by using Discordie's API
     * 
     * @param {number | string} channel_id - The channel ID that the bot is in. Do not recommend using the Midjourney server. 
     * You can get this ID by right-clicking a channel name and clicking "Copy Channel ID" or by using Discordie's API
     * 
     * @param {number} timeout - The timeout in minutes for waiting for a Discord message. Defaults to 10 minutes. 
     */
    constructor(discord_token, guild_id, channel_id, timeout = 10) {


        this.MIDJOURNEY_BOT_ID = "936929561302675456";
        this.MIDJOURNEY_BOT_CHANNEL = channel_id;
        this.GUILD_ID = guild_id;
        this.discord_token = discord_token;
        this.client = new Discordie();
        const Events = Discordie.Events;
        this.queue = [];
        this.session_id = "55c4bd6c10df4a06c8c9109f96dbddd3";
        this.loggerCB = null;
        this.disconnectResolver = null;
        this.lastPayload = null;
        this.loggedIn = false;
        this.loginResolver = null;
        this.loginPromise = new Promise((resolve) => {
            this.loginResolver = resolve;
        });
        this.timeout = timeout;

        this.client.Dispatcher.on("MESSAGE_CREATE", (e) => {
            const content = e.message.content;
            const channel = e.message.channel;
            if (content === "ping") channel.sendMessage("pong");
            if (content === "do") doCommand(e);
            if (content === "undo") undoCommand(e);
            this._newDiscordMsg(e, false);
        });
        
        this.client.Dispatcher.on("MESSAGE_UPDATE", (e) => this._newDiscordMsg(e, true));

        this.client.Dispatcher.on(Events.GATEWAY_READY, e => {
            this.loggedIn = true;
            this.loginResolver(); // Call the stored resolve function
        });

        this.client.Dispatcher.on(Events.DISCONNECTED, e => {
            this.client.connect({ token: this.discord_token });
        });

        this.client.connect({ token: this.discord_token });

        this.client.Dispatcher.on(Events.GATEWAY_DISCONNECT, (e) => {
            if (this.disconnectResolver != null) this.disconnectResolver();
        });
    }

    /**
     * Finds the progress indication string in the Discord message.
     * @param {string} str The string from the Discord message that contains the progress indicator, percentage, "Waiting to start", or "Job queued"
     * @returns The progress indicator, percentage, "Waiting to start", or "Job queued" as a string
     */
    async _getProgress(str) {
        // finds the progress indicator in the string
        const regex = /\((\d+)%\)/;
        const match = str.match(regex);
        if (match) {
            return match[1] + "%";
        } else {
            if (str.includes("Waiting to start")) return "Waiting to start";
            if (str.includes("Midjourney bot is thinking")) return "Midjourney bot is thinking";
            if (str.includes("Job queued")) {
                // In the case that the job is queued, we need to adjust the timeout  because it's going to take longer than normal
                let index = await this._findItem(str);
                clearTimeout(this.queue[index].timeout);
                this.queue[index].timeout = setTimeout(() => {
                    this.logger("Timeout waiting for Discord message (" + this.timeout * 2 + " minutes)");
                    this.queue[index].resolve(null);
                }, 1000 * 60 * this.timeout * 2); // set the timeout to double the normal timeout. This way if the job is queued, we'll wait for 20 minutes (default) instead of 10
                return "Job Queued";
            }
            // if we get here, we don't know what the progress is, so just return "In Progress"
            return "In Progress";
        }
    }

    /**
     * Find the index of the item in the queue that matches the prompt.
     * @param {string} prompt 
     * @returns index of the item in the queue or null if not found
     */
    async _findItem(prompt) {
        for (let i = 0; i < this.queue.length; i++) {
            let str1 = this.queue[i].prompt;
            let str2 = prompt;

            // in case one of the strings isn't really a string, just return null
            if (typeof str1 !== "string" || typeof str2 !== "string") return null;

            // if the prompt included a url, MJ will shorten it, so we need to replace the shortened url with the original url
            if (str2.includes("https://s.mj.run/")) {
                let addr = str2.substring(3, str2.indexOf(" ") - 1);
                let res = await fetch(addr);
                let destUrl = await res.url;
                str2 = str2.replace(addr, destUrl);
                str1 = str1.replace(destUrl, "<" + destUrl + ">"); // add the <> around the url so it matches the Discord message markup
            }

            // remove extra spaces, because either Discord or MJ is finding and removing extra spaces in the prompt string that comes back in the Discord message
            let regex = / +/g;
            let matches = str1.match(regex);
            if (matches != null) {
                str1 = str1.replace(regex, " ");
            }
            matches = str2.match(regex);
            if (matches != null) {
                str2 = str2.replace(regex, " ");
            }

            // if the prompt is an exact match, return the index
            if (str2.includes(str1)) return i;
        }
        return null;
    }

    async _checkForUUIDinQueue() {
        for (let i = 0; i < this.queue.length; i++) {
            let str1 = this.queue[i].prompt;
            let regex = /show:[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/g;
            let matches = str1.match(regex);
            if (matches == null) continue;
            if (matches.length > 0) return true;
        }
        return false;
    }


    /**
     * Handle a new message from Discord.
     * @param {object} e - The Discord message object
     * @param {bool} update - Whether or not this is an update to an existing message
     */
    async _newDiscordMsg(msgObj, isUpdate) {
        if (msgObj == null) return;
        if (msgObj.socket == null) return;
        this.session_id = msgObj.socket.sessionId;
        if (msgObj.message == null) return;
        if (msgObj.message.content === undefined) return;
        if (msgObj.message.attachments === undefined) return;
        if (msgObj.message.author == null) return;
        if (msgObj.message.author.id != this.MIDJOURNEY_BOT_ID) return;
        if (msgObj.data != null) {
            if (msgObj.data.interaction != null) {
                if (msgObj.data.interaction.name == "info") {
                    if (this.client.User.id != msgObj.data.interaction.user.id) return;
                    let index = await this._findItem("info");
                    let obj = this.queue[index];
                    if (obj == null) return;
                    if (obj.prompt != "info") return;
                    obj.resolve(msgObj.data.embeds[0].description);
                    clearTimeout(obj.timeout);
                    this.queue.splice(index, 1);
                    return;
                }
            }
        }

        if (await this._checkForUUIDinQueue()) {
            if (msgObj.message.attachments.length == 0) return;
            let img = msgObj.message.attachments[0];
            let url = img.url;
            let regex = /[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/g;
            let matches = url.match(regex);
            if (matches.length == 0) return;
            let urlUuid = matches[0];
            let index = await this._findItem("show:" + urlUuid);
            if (index != null) {
                let obj = this.queue[index];
                img.uuid = {};
                img.uuid.flag = 0;
                img.uuid.value = urlUuid;
                img.id = msgObj.message.id;
                img.prompt = msgObj.message.content.substring(2, msgObj.message.content.lastIndexOf("**"));
                img.fullPrompt = msgObj.message.content;
                obj.resolve(img);
                clearTimeout(obj.timeout);
                this.queue.splice(index, 1);
                return;
            }
        }

        let isWaitingToStart = false;
        let isQueued = false;
        let img = msgObj.message.attachments[0];
        let msgObjContent = "";
        if (img === undefined) {
            const problemResponses = ["There was an error processing your request.", "Sorry! Could not complete the job!", "Bad response", "Internal Error"];
            if (msgObj.message.embeds.length > 0) {
                let embeds = msgObj.message.embeds;
                for (let i = 0; i < embeds.length; i++) {
                    for (let key in embeds[i]) {
                        const keyIsString = (typeof embeds[i][key] == "string");
                        if (!keyIsString) continue;
                        const containsProblemResponse = problemResponses.some(item => embeds[i][key].includes(item));
                        const isCloseToProblemResponse = problemResponses.some(item => distance(item, embeds[i][key]) <= 2);
                        const payloadIsNotNull = this.lastPayload != null;

                        if (keyIsString && (containsProblemResponse || isCloseToProblemResponse) && payloadIsNotNull) {
                            for (let j = 0; j < 3; j++) await this.waitTwoOrThreeSeconds();
                            this.sendPayload(this.lastPayload);
                            return;
                        }
                        if (!payloadIsNotNull && keyIsString && (containsProblemResponse || isCloseToProblemResponse)) {
                            let ind = this._findItem(msgObj.message.content);
                            if (ind != null) {
                                this.queue[ind].resolve(null);
                            }
                        }
                    }
                }
            }
            if (
                (msgObj.message.content.includes("Bad response") ||
                    msgObj.message.content.includes("Internal Error") ||
                    msgObj.message.content.includes("There was an error processing your request.") ||
                    msgObj.message.content.includes("Invalid Form Body")
                    // TODO: Sorry! Could not complete the job!
                ) && this.lastPayload != null) {
                // check to see if this is a bad response to a payload we sent
                if (await this._findItem(msgObj.message.content) != null) {
                    // wait for a bit then resend the payload
                    for (let i = 0; i < 3; i++) await this.waitTwoOrThreeSeconds();
                    this.sendPayload(this.lastPayload);
                }
                return;
            } else if (msgObj.message.content.includes("Waiting to start")) {
                isWaitingToStart = true;
                msgObjContent = msgObj.message.content;
            } else if (msgObj.message.embeds.length > 0) { // "Job queued" message has weird formatting, so we have to check for it here
                if (msgObj.message.embeds[0].title.includes("Job queued")) {
                    isQueued = true;
                    msgObjContent = "**" + msgObj.message.embeds[0].footer.text.substring(8) + "** Job queued **";
                } else {
                    msgObjContent = msgObj.message.content;
                }
            } else {
                return;
            }
        } else {
            msgObjContent = msgObj.message.content;
        }

        // if we're waiting to start or queued, we don't have an image yet, so we need to find the prompt
        if (!isWaitingToStart && !isQueued && img !== undefined) {
            const regexString = "([A-Za-z0-9]+(-[A-Za-z0-9]+)+)";
            const regex = new RegExp(regexString);
            const matches = regex.exec(img.url);
            let uuid = "";

            img.uuid = {};
            img.uuid.flag = 0;
            if (matches[0] == "ephemeral-attachments") {
                uuid = img.url.substring(img.url.indexOf(".png?") - 36, img.url.indexOf(".png?"));
                img.uuid.flag = 64;
            } else {
                uuid = matches[0];
            }

            img.uuid.value = uuid
            img.id = msgObj.message.id;

            img.prompt = msgObjContent.substring(2, msgObjContent.lastIndexOf("**"));
        }

        // if we're waiting to start or queued, we don't have an image yet, so we need to find the prompt
        let index = await this._findItem(msgObjContent);
        if (index == null) {
            return;
        }

        // if we're waiting to start or queued, we don't have an image yet, we found the prompt, so call the callback and return
        let item = this.queue[index];
        if (isUpdate || isWaitingToStart || isQueued) {
            if (item.cb !== null) {
                let progress = await this._getProgress(msgObjContent);
                item.cb(img !== undefined ? img.url : null, progress);
            }
            return;
        } else {
            // Image generation finished!
            clearTimeout(item.timeout);
            item.resolve(img);
            this.queue.pop(index);
        }
    }

    _waitForDiscordMsg(obj) {
        this.logger("Waiting for Discord message...");
        return new Promise((resolve) => {
            if (obj.isX4Upscale === true) {
                obj.resolve = resolve;
                obj.timeout = setTimeout(() => {
                    this.logger("Timeout waiting for Discord message (" + ((this.timeout >= 30) ? this.timeout : 30) + " minutes)");
                    obj.resolve(null);
                }, 1000 * 60 * ((this.timeout >= 30) ? this.timeout : 30)); // 30 minute minimum timeout for x4 upscale
            } else if (obj.isInfo === true) {
                obj.resolve = resolve;
                obj.timeout = setTimeout(() => {
                    this.logger("Timeout waiting for Discord message (30 seconds)");
                    obj.resolve(null);
                }, 1000 * 30); // 30 second timeout for /info command
            } else {
                obj.resolve = resolve;
                obj.timeout = setTimeout(() => {
                    this.logger("Timeout waiting for Discord message (" + this.timeout + " minutes)");
                    obj.resolve(null);
                }, 1000 * 60 * this.timeout); // 10 minutes timeout by default
            }
        });
    }

    _waitForDiscordDisconnect() {
        if (!this.client.connected) {
            return;
        }
        return new Promise((resolve) => {
            this.logger("Waiting for Discord disconnect");
            this.disconnectResolver = resolve;
        });
    }

    async waitTwoOrThreeSeconds() {
        // waits like 2, 3 -ish seconds to try and avoid automation detection
        await new Promise(resolve => setTimeout(resolve, 1000 * (Math.floor(Math.random() * 5) + 2)));
    };

    /**
     * Build a payload to send to Discord.
     * @param {int} type - The type of payload to send. Get this by analyzing Discord using F12
     * @param {string} custom_id - The custom ID to send to Discord
     * @param {object} obj - The object returned from generateImage
     * @returns {object} - The payload object
     */
    buildPayload(type, custom_id, obj) {

        const payload = {
            type: type,
            guild_id: this.GUILD_ID,
            channel_id: this.MIDJOURNEY_BOT_CHANNEL,
            message_flags: obj.uuid.flag,
            message_id: obj.id,
            application_id: "936929561302675456",
            session_id: this.session_id,
            data: {
                component_type: 2,
                custom_id: custom_id,
            }
        };
        return payload;
    }

    /**
     * Cancel the current job.
    */
    async cancelJob() {

        if (this.currentJobObj == null) {
            return;
        }
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Cancelling job for image:", this.currentJobObj.uuid.value);
        const payload = this.buildPayload(3, "MJ::CancelJob::ByJobid::" + this.currentJobObj.uuid.value, this.currentJobObj);
        this.sendPayload(payload);
        return;
    }

    /**
     * Call for a x4 upscale of the image from the bot.
     * @param {object} obj - The object returned from generateImage
     * @param {string} prompt - The prompt used to generate the image
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async x4_upscale(obj, prompt, callback = null) {

        this.currentJobObj = obj;
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Waiting for a bit then calling x4 upscale...");
        await this.waitTwoOrThreeSeconds();
        this.logger("X4 upscale image:", obj.uuid.value);
        const payload = this.buildPayload(3, "MJ::JOB::upsample_v5_4x::1::" + obj.uuid.value + "::SOLO", obj);
        this.sendPayload(payload);
        let obj1 = { prompt: prompt, cb: callback, isX4Upscale: true };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    /**
     * Call for a variation of the image from the bot.
     * @param {object} obj - The object returned from generateImage
     * @param {int} selectedImage - The image number to use for the variation
     * @param {string} prompt - The prompt used to generate the image
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async variation(obj, selectedImage, prompt, callback = null) {

        this.currentJobObj = obj;
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Waiting for a bit then calling variation...");
        await this.waitTwoOrThreeSeconds();
        this.logger("Variation image:", obj.uuid.value);
        const payload = this.buildPayload(3, "MJ::JOB::variation::" + selectedImage + "::" + obj.uuid.value, obj);
        this.sendPayload(payload);
        let obj1 = { prompt: prompt, cb: callback };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    /**
     * Call for a zoom out of the image from the bot.
     * @param {object} obj - The object returned from generateImage
     * @param {string} prompt - The prompt used to generate the image
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async zoomOut(obj, prompt, callback = null) {

        this.currentJobObj = obj;
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Waiting for a bit then calling zoom out...");
        await this.waitTwoOrThreeSeconds();
        this.logger("Zoom out image:", obj.uuid.value);
        const payload = this.buildPayload(3, "MJ::Outpaint::50::1::" + obj.uuid.value + "::SOLO", obj);
        this.sendPayload(payload);
        let obj1 = { prompt: prompt, cb: callback };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    /**
     * Call for a reroll of the image from the bot.
     * @param {object} obj - The object returned from generateImage
     * @param {string} prompt - The prompt used to generate the image
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async rerollImage(obj, prompt, callback = null) {

        this.currentJobObj = obj;
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Waiting for a bit then calling reroll...");
        await this.waitTwoOrThreeSeconds();
        this.logger("Reroll image:", obj.uuid.value);
        const payload = this.buildPayload(3, "MJ::JOB::reroll::0::" + obj.uuid.value + "::SOLO", obj);
        this.sendPayload(payload);
        let obj1 = { prompt: prompt, cb: callback };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    /**
     * Call for an upscaled image from the bot.
     * @param {object} obj - The object returned from generateImage
     * @param {int} imageNum - The image number to upscale
     * @param {string} prompt - The prompt used to generate the image
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async upscaleImage(obj, imageNum, prompt) {

        this.currentJobObj = obj;
        this.logger("Waiting for a bit then calling for upscaled image...");
        await this.waitTwoOrThreeSeconds();
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        this.logger("Upscaling image #" + imageNum + " from ", obj.uuid.value);
        const payload = this.buildPayload(3, "MJ::JOB::upsample::" + imageNum + "::" + obj.uuid.value, obj);
        this.sendPayload(payload);
        let obj1 = { prompt: prompt, cb: null };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    async showCommand(uuid, callback = null) {
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        const payload = {
            type: 2,
            application_id: "936929561302675456",
            guild_id: this.GUILD_ID,
            channel_id: this.MIDJOURNEY_BOT_CHANNEL,
            session_id: this.session_id,
            data: {
                version: "1169435442328911903",
                id: "1169435442328911902",
                name: "show",
                type: 1,
                options: [
                    {
                        type: 3,
                        name: "job_id",
                        value: uuid
                    }
                ],
                application_command: {
                    id: "1169435442328911902",
                    application_id: "936929561302675456",
                    version: "1169435442328911903",
                    default_member_permissions: null,
                    type: 1,
                    nsfw: false,
                    name: "show",
                    description: "Shows the job view based on job id.",
                    dm_permission: true,
                    contexts: null,
                    integration_types: [
                        0
                    ],
                    options: [
                        {
                            type: 3,
                            name: "job_id",
                            description: "The job ID of the job you want to show. It should look similar to this:…",
                            required: true
                        }
                    ]
                },
                attachments: []
            }
        };
        this.sendPayload(payload);
        let obj1 = { prompt: "show:" + uuid, cb: callback };
        this.queue.push(obj1);
        return await this._waitForDiscordMsg(obj1);
    }

    /**
     * Run the /info command on the MJ bot to get info about your account.
     */
    async getInfo() {
        if (!this.loggedIn) {
            await this.loginPromise;
        }
        const payload = {
            type: 2,
            application_id: "936929561302675456",
            guild_id: this.GUILD_ID,
            channel_id: this.MIDJOURNEY_BOT_CHANNEL,
            session_id: this.session_id,
            data: {
                version: "1166847114203123799",
                id: "972289487818334209",
                name: "info",
                type: 1,
                options: [],
                application_command: {
                    id: "972289487818334209",
                    application_id: "936929561302675456",
                    version: "1166847114203123799",
                    default_member_permissions: null,
                    type: 1,
                    nsfw: false,
                    name: "info",
                    description: "View information about your profile.",
                    dm_permission: true,
                    contexts: null,
                    integration_types: [
                        0
                    ]
                },
                attachments: []
            }
        };

        this.sendPayload(payload);
        let obj1 = { prompt: "info", cb: null, isInfo: true };
        this.queue.push(obj1);
        return await this._waitForDiscordMsg(obj1);
    }

    /**
     * Send a payload to Discord.
     * @param {object} payload - The payload to send to Discord
     */
    async sendPayload(payload) {

        if (!this.loggedIn) {
            await this.loginPromise;
        }

        this.lastPayload = payload;

        const headers = {
            authorization: this.discord_token,
        };

        try {
            const response = await axios.post(
                "https://discord.com/api/v9/interactions",
                payload,
                { headers }
            );
        } catch (error) {
            if (error.response) {
                // The request was made, and the server responded with a status code that falls out of the range of 2xx
                console.error(
                    "Error response:",
                    error.response.status,
                    error.response.data,
                    "\n\nJSON.stringify:\n",
                    JSON.stringify(error, null, 2)
                );
            } else if (error.request) {
                // The request was made, but no response was received
                console.error("No response received:", error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error("Error during request setup:", error.message);
            }
        }
    }

    /**
     * Generate image from the prompt.
     * @param {string} prompt - What image you'd like to see
     * @param {function} callback - Optional callback function that gets called each time MJ updates the initial post with a progress update
     * @returns {object} - The image object
     */
    async generateImage(prompt, callback = null) {

        if (!this.loggedIn) {
            await this.loginPromise;
        }

        const payload = {
            type: 2,
            application_id: "936929561302675456",
            guild_id: this.GUILD_ID,
            channel_id: this.MIDJOURNEY_BOT_CHANNEL,
            session_id: this.session_id,
            data: {
                version: "1166847114203123795",
                id: "938956540159881230",
                name: "imagine",
                type: 1,
                options: [
                    {
                        type: 3,
                        name: "prompt",
                        value: prompt
                    }
                ],
                application_command: {
                    id: "938956540159881230",
                    application_id: "936929561302675456",
                    version: "1166847114203123795",
                    default_member_permissions: null,
                    type: 1,
                    nsfw: true,
                    name: "imagine",
                    description: "Create images with Midjourney",
                    dm_permission: true,
                    contexts: null,
                    integration_types: [
                        0
                    ],
                    options: [
                        {
                            type: 3,
                            name: "prompt",
                            description: "The prompt to imagine",
                            required: true
                        }
                    ]
                },
                attachments: []
            }
        };

        this.sendPayload(payload);

        let obj1 = { prompt: prompt, cb: callback };
        this.queue.push(obj1);
        let ret = await this._waitForDiscordMsg(obj1);
        if (ret == null) {
            return null;
        }
        ret.prompt = prompt;
        return ret;
    }

    /**
     * Waits for the bot to disconnect from Discord.
     * @returns Nothing
     */
    async close() {
        this.client.disconnect();
        return await this._waitForDiscordDisconnect();
    }

    /**
     * Logger function. Calls the callback function if it's registered, otherwise just logs to the console.
     * @param {string} msg - The message to log
     */
    logger(msg) {
        if (this.loggerCB == null) {
            console.log("MJ-Discord Bridge Logger:", { msg });
        } else {
            this.loggerCB(msg);
        }
    }

    /**
     * Register the callback function for logging.
     * @param {function} cb - The logging function to call. It will be passed a single string parameter.
     */
    registerLoggerCB(cb) { this.loggerCB = cb; }
}
module.exports = { MidjourneyDiscordBridge };