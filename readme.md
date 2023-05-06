# MidjourneyDiscordBridge

## Node library that interacts with Midjourney's Discord Bot

MidjourneyDiscordBridge is a Node.js library for interacting with the [Midjourney](https://www.midjourney.com) Discord bot, which generated images from natural language descriptions, also known as "prompts". This library makes it easy for developers to integrate Midjourney into their own projects or applications.

**Note:** This unofficial API library is not endorsed by Midjourney or Discord and violates their Terms of Service. Use it at your own risk; the creator assumes no liability for any consequences. Please adhere to each platform's ToS and exercise caution with unofficial resources.

## Installation

To install the MidjourneyDiscordBridge library, run the following command:

```
npm install midjourney-discord-bridge
```

## Usage

Here's a simple example of how to use MidjourneyDiscordBridge in your Node.js application:

```
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
```

## Demo

![Demo GIF](https://user-images.githubusercontent.com/18037362/236650595-67299740-f799-4ad1-9e0d-79acae54a880.gif)

## Dependencies

MidjourneyDiscordBridge requires the following dependencies:

- `axios`
- `discordie`