/**
 * MASROOF — Google Apps Script background backup service
 *
 * Keep WEBHOOK_SECRET private in the Apps Script project. Do not copy it
 * into the website source. Every deviceId is bound to one Drive file and a
 * bound file is never overwritten when its envelope belongs to another device.
 */

const CONFIG = {
  WEBHOOK_SECRET: "CHANGE_THIS_TO_A_LONG_PRIVATE_SECRET",
  BACKUP_FOLDER_NAME: "MASROOF Background Sync",
  DEVICE_FILE_PREFIX: "MASROOF-",
  MAX_DEVICE_NAME_LENGTH: 60,
};

function doGet(e) {
  try {
    const secret = e && e.parameter ? String(e.parameter.secret || "") : "";
    if (secret !== CONFIG.WEBHOOK_SECRET) return jsonResponse_({ ok: false, error: "Unauthorized" });
    const deviceId = e && e.parameter ? String(e.parameter.deviceId || "").trim() : "";
    if (deviceId) validateDeviceId_(deviceId);
    const props = PropertiesService.getScriptProperties();
    const response = {
      ok: true,
      service: "masroof-background-sync",
      lastScheduledSync: props.getProperty("LAST_SCHEDULED_SYNC") || null,
      lastScheduledFileName: props.getProperty("LAST_SCHEDULED_FILE_NAME") || null,
    };
    if (deviceId) {
      const fileId = props.getProperty(devicePropertyKey_(deviceId));
      const file = fileId ? safeGetFile_(fileId) : null;
      response.deviceId = deviceId;
      response.deviceFileId = file ? file.getId() : null;
      response.deviceLastReceivedAt = props.getProperty(deviceReceivedKey_(deviceId)) || null;
      response.deviceLastScheduledSync = props.getProperty(deviceScheduledKey_(deviceId)) || null;
      response.deviceFileName = file ? file.getName() : null;
    }
    return jsonResponse_(response);
  } catch (error) {
    return jsonResponse_({ ok: false, error: errorMessage_(error) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonResponse_({ ok: false, error: "Missing request body" });
    const request = JSON.parse(e.postData.contents);
    if (request.secret !== CONFIG.WEBHOOK_SECRET) return jsonResponse_({ ok: false, error: "Unauthorized" });
    if (request.action === "ping") return jsonResponse_({ ok: true, service: "masroof-background-sync", checkedAt: new Date().toISOString() });
    if (request.action !== "backup") return jsonResponse_({ ok: false, error: "Unsupported action" });

    const payload = request.payload;
    validatePayload_(payload);
    const receivedAt = new Date().toISOString();
    const deviceId = String(payload.deviceId).trim();
    const deviceName = normalizeDeviceName_(payload.deviceName);
    lock.waitLock(20000);
    const folder = getBackupFolder_();
    const file = upsertDeviceFile_(folder, deviceId, deviceName, payload, receivedAt);
    const props = PropertiesService.getScriptProperties();
    props.setProperty(devicePropertyKey_(deviceId), file.getId());
    props.setProperty(deviceReceivedKey_(deviceId), receivedAt);
    return jsonResponse_({ ok: true, receivedAt, deviceId, deviceName, fileName: file.getName(), fileId: file.getId() });
  } catch (error) {
    return jsonResponse_({ ok: false, error: errorMessage_(error) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) { /* lock was not acquired */ }
  }
}

/** Copies each known device file to a timestamped file without merging devices. */
function scheduledSync() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder = getBackupFolder_();
    const propsService = PropertiesService.getScriptProperties();
    const props = propsService.getProperties();
    const now = new Date();
    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd-HH-mm-ss");
    const deviceIds = Object.keys(props)
      .filter(function (key) { return key.indexOf("DEVICE_FILE_") === 0; })
      .map(function (key) { return key.substring("DEVICE_FILE_".length); });
    let copied = 0;
    deviceIds.forEach(function (deviceId) {
      const fileId = props[devicePropertyKey_(deviceId)];
      if (!fileId) return;
      try {
        const source = DriveApp.getFileById(fileId);
        const envelope = readEnvelope_(source);
        if (!envelope || envelope.deviceId !== deviceId) return;
        const backupName = source.getName().replace(/\.json$/i, "") + "-scheduled-" + stamp + ".json";
        folder.createFile(backupName, source.getBlob().getDataAsString(), "application/json");
        props[deviceScheduledKey_(deviceId)] = now.toISOString();
        props.LAST_SCHEDULED_SYNC = now.toISOString();
        props.LAST_SCHEDULED_FILE_NAME = backupName;
        copied += 1;
      } catch (error) {
        // Keep processing other devices when one binding is unavailable.
      }
    });
    props.LAST_SCHEDULED_DEVICE_COUNT = String(copied);
    propsService.setProperties(props, true);
  } finally {
    lock.releaseLock();
  }
}

function setupEvery3Hours() { createSchedule_("hours", 3); }
function setupEvery12Hours() { createSchedule_("hours", 12); }
function setupDaily() { createSchedule_("days", 1); }

function createSchedule_(unit, amount) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "scheduledSync") ScriptApp.deleteTrigger(trigger);
  });
  const builder = ScriptApp.newTrigger("scheduledSync").timeBased();
  if (unit === "hours") builder.everyHours(amount).create();
  else builder.everyDays(amount).create();
}

function getBackupFolder_() {
  const folders = DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CONFIG.BACKUP_FOLDER_NAME);
}

function upsertDeviceFile_(folder, deviceId, deviceName, payload, receivedAt) {
  const props = PropertiesService.getScriptProperties();
  const boundKey = devicePropertyKey_(deviceId);
  const boundId = props.getProperty(boundKey);
  const content = JSON.stringify({ app: "masroof-background-sync", deviceId: deviceId, deviceName: deviceName || null, receivedAt: receivedAt, payload: payload }, null, 2);

  if (boundId) {
    const boundFile = safeGetFile_(boundId);
    if (boundFile) {
      const envelope = readEnvelope_(boundFile);
      if (!envelope || envelope.deviceId !== deviceId) throw new Error("Bound file belongs to another device");
      boundFile.setContent(content);
      return boundFile;
    }
    props.deleteProperty(boundKey);
  }

  const preferredName = deviceFileName_(deviceName, deviceId, false);
  const candidates = folder.getFilesByName(preferredName);
  while (candidates.hasNext()) {
    const candidate = candidates.next();
    const envelope = readEnvelope_(candidate);
    if (envelope && envelope.deviceId === deviceId) {
      candidate.setContent(content);
      props.setProperty(boundKey, candidate.getId());
      return candidate;
    }
  }

  // If another device already owns the human-readable name, create a
  // deterministic collision-safe name rather than overwriting that device.
  const collision = folder.getFilesByName(preferredName).hasNext();
  const name = deviceFileName_(deviceName, deviceId, collision);
  const file = folder.createFile(name, content, "application/json");
  props.setProperty(boundKey, file.getId());
  return file;
}

function deviceFileName_(deviceName, deviceId, collision) {
  const label = normalizeDeviceName_(deviceName) || "device";
  const base = CONFIG.DEVICE_FILE_PREFIX + label.toLowerCase().replace(/\s+/g, "-");
  if (!collision) return base + ".json";
  const shortId = deviceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12).replace(/^-+|-+$/g, "") || "unknown";
  return base + "-" + shortId + ".json";
}

function normalizeDeviceName_(value) {
  return String(value || "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, CONFIG.MAX_DEVICE_NAME_LENGTH) || "device";
}

function validateDeviceId_(deviceId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,119}$/.test(deviceId)) throw new Error("Invalid device ID format");
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
  if (payload.app !== "masroof") throw new Error("Invalid app identifier");
  if (!Array.isArray(payload.expenses)) throw new Error("Expenses array is missing");
  if (!payload.deviceId || typeof payload.deviceId !== "string") throw new Error("Device ID is required");
  validateDeviceId_(String(payload.deviceId).trim());
  if (String(payload.deviceName || "").length > CONFIG.MAX_DEVICE_NAME_LENGTH) throw new Error("Device name is too long");
}

function readEnvelope_(file) {
  try {
    const value = JSON.parse(file.getBlob().getDataAsString());
    return value && value.app === "masroof-background-sync" && typeof value.deviceId === "string" ? value : null;
  } catch (error) {
    return null;
  }
}

function safeGetFile_(fileId) {
  try { return DriveApp.getFileById(fileId); } catch (error) { return null; }
}

function devicePropertyKey_(deviceId) { return "DEVICE_FILE_" + deviceId; }
function deviceReceivedKey_(deviceId) { return "DEVICE_RECEIVED_" + deviceId; }
function deviceScheduledKey_(deviceId) { return "DEVICE_SCHEDULED_" + deviceId; }
function errorMessage_(error) { return String(error && error.message ? error.message : error); }
function jsonResponse_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
