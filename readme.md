# MidjourneyDiscordBridge

## Node library that interacts with Midjourney's Discord Bot

MidjourneyDiscordBridge is a Node.js library for interacting with the [Midjourney](https://www.midjourney.com) Discord bot, which generated images from natural language descriptions, also known as "prompts". This library makes it easy for developers to integrate Midjourney into their own projects or applications.

**Note:** This unofficial API library is not endorsed by Midjourney or Discord and violates their Terms of Service. Use it at your own risk; the creator assumes no liability for any consequences. Please adhere to each platform's ToS and exercise caution with unofficial resources.

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

## Installation

To install the MidjourneyDiscordBridge library, run the following command:

```bash
npm install midjourney-discord-bridge
```

## Dependencies

MidjourneyDiscordBridge requires the following dependencies:

- `axios`
- `discordie`
