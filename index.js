const axios = require("axios");
const Discordie = require("discordie");

class MidjourneyDiscordApi {
  constructor(discord_token) {
    /**
     * @param {string} discord_token - Your discord token that has access to Midjourney bot
     */

    this.MIDJOURNEY_BOT_ID = "936929561302675456";
    this.MIDJOURNEY_BOT_CHANNEL = "1094247536895737896";
    this.discord_token = discord_token;

    this.client = new Discordie();
    const Events = Discordie.Events;
    this.queue = [];

    this.loggedIn = false;
    this.loginResolver = null;
    this.loginPromise = new Promise((resolve) => {
        this.loginResolver = resolve;
    });

    this.client.Dispatcher.on("MESSAGE_CREATE", (e) => {
      const content = e.message.content;
      const channel = e.message.channel;

      if (content === "ping") channel.sendMessage("pong");
      if (content === "do") doCommand(e);
      if (content === "undo") undoCommand(e);

      if (e.message.content.endsWith("(Waiting to start)")) return; // Ignore this message

      this._newDiscordMsg(e, false);
    });

    this.client.Dispatcher.on("MESSAGE_UPDATE", (e) => this._newDiscordMsg(e, true));

    this.client.Dispatcher.on(Events.GATEWAY_READY, e => {
        console.log("Connected to the Discord as: " + this.client.User.username);
        this.loggedIn = true;
        this.loginResolver(); // Call the stored resolve function
    });

    this.client.Dispatcher.on(Events.DISCONNECTED, e => {
        console.log('Disconnected from Discord');
        this.client.connect({ token: this.discord_token });
    });

    this.client.connect({ token: this.discord_token });
  }


  _getProgress(str) {
    const regex = /\((\d+)%\)/;
    const match = str.match(regex);
    if (match) {
      return match[1];
    } else {
      return 100;
    }
  }

  _findItem(prompt) {
    for (let i = 0; i < this.queue.length; i++) {
        if (prompt.includes(this.queue[i].prompt)) {
            return i;
        }
    }
    return null;
  }

  _newDiscordMsg(e, update) {
    /**
     * Handle a new message from Discord.
     */

    const channel = e.message.channel;

    // Not a DM and not from the bot itself
    if (
      channel.type !== Discordie.ChannelTypes.DM ||
      e.message.author.id !== this.MIDJOURNEY_BOT_ID
    )
      return;

    let img = e.message.attachments[0];
    if (img === undefined) return; // Ignore this message

    let prompt_msg = e.message.content.substring(2); // Remove first two characters **

    let index = this._findItem(prompt_msg);
    if (index == null) {
      console.log("No item found for this prompt!", prompt_msg);
      return;
    }
    let item = this.queue[index];


    if (update) {
        if (item.cb !== null) {
            let progress = this._getProgress(e.message.content);
            item.cb(img.url, progress);
        }
        return;
    } else {
        // Image generation finished!
        item.resolve(img.url);
    }
  }

  _waitForDiscordMsg(obj) {
    return new Promise((resolve) => {
      obj.resolve = resolve;
    });
  }

  async generateImage(prompt, callback = null) {
    /**
     * Generate image from the prompt.
     * @param {string} prompt - What image you'd like to see
     * @param {function} callback - Optional callback function to call when image is ready
     * @returns {string} - The image URL
     */
    if (!this.loggedIn) {
        await this.loginPromise;
    }

    const payload = {
      type: 2,
      application_id: this.MIDJOURNEY_BOT_ID,
      channel_id: this.MIDJOURNEY_BOT_CHANNEL,
      session_id: "b8aabd9b2d39a894a82925f079b66884",
      data: {
        version: "1077969938624553050",
        id: "938956540159881230",
        name: "imagine",
        type: 1,
        options: [{ type: 3, name: "prompt", value: prompt }],
        application_command: {
          id: "938956540159881230",
          application_id: this.MIDJOURNEY_BOT_ID,
          version: "1077969938624553050",
          default_permission: true,
          default_member_permissions: null,
          type: 1,
          nsfw: false,
          name: "imagine",
          description: "Create images with Midjourney",
          dm_permission: true,
          options: [
            {
              type: 3,
              name: "prompt",
              description: "The prompt to imagine",
              required: true,
            },
          ],
        },
        attachments: [],
      },
    };

    const headers = {
      authorization: this.discord_token,
    };

    try {
      const response = await axios.post(
        "https://discord.com/api/v9/interactions",
        payload,
        { headers }
      );
      console.log(response.data);
    } catch (error) {
      if (error.response) {
        // The request was made, and the server responded with a status code that falls out of the range of 2xx
        console.error(
          "Error response:",
          error.response.status,
          error.response.data
        );
      } else if (error.request) {
        // The request was made, but no response was received
        console.error("No response received:", error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("Error during request setup:", error.message);
      }
    }
    const obj = { prompt: prompt, cb: callback };
    this.queue.push(obj);
    return await this._waitForDiscordMsg(obj);
  }

  close() {
    this.client.disconnect();
  }
}

module.exports = {
  MidjourneyDiscordApi,
};
