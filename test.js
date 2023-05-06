const { MidjourneyDiscordBridge } = require("midjourney-discord-bridge");

const axios = require("axios");
const sharp = require('sharp');

function img_update(img_url, progress) {
    console.log("Image update:", img_url, 'Progress:', progress)
}

async function main() {
    const mj = new MidjourneyDiscordBridge(discord_token='my_discord_token');

    const img_url = await mj.generateImage(
      'Tiny astronaut standing on a tiny round moon, cartoon',
      callback=img_update // Optional
    );
    console.log("Midjourney image generation completed:", img_url);

    // Do something with the image
    const response = await axios.get(img_url, { responseType: 'arraybuffer' });
    await sharp(response.data).toFile('output.png');
    mj.close()
}

main();
