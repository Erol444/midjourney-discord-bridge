# MidjourneyDiscordBridge

## Node library that interacts with Midjourney's Discord Bot

MidjourneyDiscordBridge is a Node.js library for interacting with the [Midjourney](https://www.midjourney.com) Discord bot, which generated images from natural language descriptions, also known as "prompts". This library makes it easy for developers to integrate Midjourney into their own projects or applications.

**Note:** This unofficial API library is not endorsed by Midjourney or Discord and violates their Terms of Service. Use it at your own risk; the creator assumes no liability for any consequences. Please adhere to each platform's ToS and exercise caution with unofficial resources.

### Contributors

[GitHub: AndrewMcDan](https://github.com/andrewmcdan)

## Demo

![Demo GIF](https://user-images.githubusercontent.com/18037362/236650796-afaefb1f-af36-4185-a1f9-29f7106c39e2.gif)

## Usage

Here's a simple example of how to use MidjourneyDiscordBridge in your Node.js application:

```javascript
const { MidjourneyDiscordBridge } = require("midjourney-discord-bridge");

const axios = require("axios");
const sharp = require('sharp');

function img_update(img_url, progress) {
    console.log("Image update:", img_url, 'Progress:', progress)
}

async function main() {
    const mj = new MidjourneyDiscordBridge(discord_token, guild_id/*server ID*/, channel_id, timeout);

    // Calls the generateImage function and returns an object with the image url and other information needed to call other functions
    const grid_img_obj = await mj.generateImage(
      'Tiny astronaut standing on a tiny round moon, cartoon',
      callback=img_update // Optional
    );

    let img_url = grid_img_obj.url;

    // Do something with the image
    const response = await axios.get(img_url, { responseType: 'arraybuffer' });
    await sharp(response.data).toFile('output.png');
    
    // Calls for an upscaled image from Midjourney using the object returned from generateImage as a reference
    const upscale_img_obj = await mj.upscaleImage(
      grid_img_obj, // must be an object returned from generateImage
      1, // must be an integer between 1 and 4, representing the image to upscale
      callback=img_update // Optional
    );

    img_url = upscale_img_obj.url;

    // Do something with the image
    const response = await axios.get(img_url, { responseType: 'arraybuffer' });
    await sharp(response.data).toFile('output.png');
    mj.close()
}

main();
```

## Installation

To install the MidjourneyDiscordBridge library, run the following command:

```bash
npm install midjourney-discord-bridge
```

## Dependencies

MidjourneyDiscordBridge requires the following dependencies:

- `axios`
- `discordie`
