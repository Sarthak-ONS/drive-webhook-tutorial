require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const expressSession = require("express-session");

const DriveHelpers = require("./drive.helpers");

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } =
  process.env;

const PORT = process.env.PORT;
const app = express();

let access_token = null;
let refresh_token = null;

app.use(expressSession({ secret: "this_is_my_secret" }));
app.use(
  bodyParser.json({
    limit: "50mb",
    verify: (req, _, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/drive", async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL
  );

  const scopes = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  return res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL
  );
  const { code, error } = req.query;

  if (error) {
    return res.json({ error });
  }

  const { tokens } = await oauth2Client.getToken(code);

  access_token = tokens.access_token;
  refresh_token = tokens.refresh_token;

  const watchResponse = await DriveHelpers.watchFolder({
    folderId: "1246W-znMUQXWKEPNctjjf37U2qBcs9WG",
    channelId: "fba4ac9c-3d9c-4f82-bca7-1246W-znMUQXWKEPNctjjf37U2qBcs9WG",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  res.json({ tokens, watchResponse });
});

let pageToken = null;

app.post("/webhooks/drive", async (req, res) => {
  res.status(200).send("OK");

  const channelId = req.headers["x-goog-channel-id"];

  console.log("Channel ID: ", channelId);

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token,
    refresh_token,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  if (!pageToken) {
    const startPageTokenResponse = await drive.changes.getStartPageToken();
    pageToken = startPageTokenResponse.data.startPageToken;

    console.log("Page token found.", {
      startPageToken: pageToken,
    });
  }
  const response = await drive.changes.list({
    pageSize: 500,
    pageToken,
    fields: "*",
  });

  const changes = response.data.changes;

  console.log("Changes: ", JSON.stringify(changes, null, 2));

  changes.forEach(async (change) => {
    await DriveHelpers.downloadDriveFile({
      driveClient: oauth2Client,
      driveFileId: change.fileId.toString(),
      fileName: change.file.name,
      access_token,
      refresh_token,
    });

    console.log("Downloaded file: ", change.file.name);
  });
});

app.listen(PORT, () => {
  console.log("Server is running on port", PORT);
});
