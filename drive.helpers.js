const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const {
  DRIVE_CLIENT_ID,
  DRIVE_CLIENT_SECRET,
  DRIVE_CALLBACK_URL,
  DRIVE_WEBHOOK_REGISTRATION_URL,
} = process.env;

function createOAuthClient({ access_token, refresh_token }) {
  const oauth2Client = new google.auth.OAuth2(
    DRIVE_CLIENT_ID,
    DRIVE_CLIENT_SECRET,
    DRIVE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token,
    refresh_token,
  });

  return oauth2Client;
}

const watchFolder = async ({
  folderId,
  channelId,
  access_token,
  refresh_token,
}) => {
  try {
    const oAuthClient = createOAuthClient({
      access_token,
      refresh_token,
    });

    const drive = google.drive({
      version: "v3",
      auth: oAuthClient,
    });

    const watchResponse = await drive.files.watch({
      fileId: folderId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: DRIVE_WEBHOOK_REGISTRATION_URL,
        // expiration: new Date().getTime() + 1000 * 60 * 60 * 24 * 7,
      },
    });

    if (!watchResponse) {
      throw new Error("Failed to start watch");
    }

    console.log("Watch started:", watchResponse.data);
    return watchResponse.data;
  } catch (error) {
    console.error("Error starting watch:", error);
    return false;
  }
};

const downloadDriveFile = async ({
  refresh_token,
  access_token,
  driveFileId,
  fileName,
}) => {
  try {
    const client = createOAuthClient({
      access_token,
      refresh_token,
    });

    const drive = google.drive({
      version: "v3",
      auth: client,
    });

    const fileResponse = await drive.files.get(
      {
        fileId: driveFileId,
        alt: "media",
      },
      {
        responseType: "stream",
      }
    );

    if (!fileResponse) {
      return Promise.reject("Failed to download the file");
    }

    const destPath = path.resolve(process.cwd(), "downloads");

    const dest = fs.createWriteStream(path.join(destPath, fileName));

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    fileResponse.data.pipe(dest);

    return new Promise((resolve, reject) => {
      dest.on("finish", () => {
        console.log(`File downloaded and saved to ${fileName}`);
        resolve(true);
      });

      dest.on("error", (err) => {
        console.error("Error downloading the file:", err);
        reject(err);
      });
    });
  } catch (error) {
    console.error("Error downloading the file:", error);
    return false;
  }
};

module.exports = {
  watchFolder,
  downloadDriveFile,
};
