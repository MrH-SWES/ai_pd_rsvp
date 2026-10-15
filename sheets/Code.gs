/**
 * Private, append-only RSVP collection for the approved staff-session survey.
 * Configure RSVP_SPREADSHEET_ID and optionally RSVP_SHEET_NAME in Script Properties.
 * Never put a spreadsheet ID, credentials, or response data in the public site.
 * All helpers end in _ so google.script.run cannot invoke them.
 */
var RSVP_REQUIRE_RECIPIENT_ = true;
var RSVP_PARENT_ORIGIN_ = 'https://mrh-swes.github.io';
var RSVP_MAX_INPUT_BYTES_ = 20000;
var RSVP_LOCK_TIMEOUT_MS_ = 10000;
var RSVP_RATE_WINDOW_MS_ = 60000;
var RSVP_RATE_LIMIT_ = 60;
var RSVP_MAX_RESPONSES_ = 10000;
var RSVP_REQUEST_ID_ = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
var RSVP_HEADERS_ = [
  'received_at_utc', 'request_id', 'payload_sha256', 'response_name',
  'interest', 'experience', 'tools', 'uses', 'beliefs', 'blockers',
  'example', 'question', 'availability', 'response_email'
];
// Keep these exact approved values in sync with lib/survey.ts.
var RSVP_OPTIONS_ = {
  interest: ['curious', 'interested', 'eager', 'eager_unsure'],
  experience: ['Regularly', 'A few times', 'Once or twice', 'Not yet', 'Not sure'],
  tools: ['ChatGPT', 'Claude', 'Gemini', 'Microsoft Copilot', 'MagicSchool', 'Brisk', 'Canva AI', 'Other teaching tools', 'Something else', 'I don’t remember'],
  uses: ['Lesson planning', 'Worksheets & activities', 'Adapting reading materials', 'Feedback & assessment', 'Emails & writing', 'Summarizing information', 'Organizing & admin', 'Answering questions', 'Personal projects', 'Images & creative work', 'Something else'],
  beliefs: ['A useful thinking partner', 'Mostly a better search engine', 'Promising, but overhyped', 'A fad', 'Potentially harmful', 'I’m still figuring it out'],
  blockers: ['Accuracy & trust', 'Student privacy', 'Bias & fairness', 'Student learning', 'School policy', 'Time to learn', 'Cost or access', 'Where to start', 'Something else', 'Nothing in particular'],
  // session-a: Tuesday, November 3, 2026, 3:30–4:30 p.m. Pacific (PST).
  // session-b: Thursday, November 5, 2026, 3:30–4:30 p.m. Pacific (PST).
  availability: ['session-a', 'session-b', 'neither', 'updates']
};
var RSVP_ERRORS_ = {
  input: 'Please review your response and try again.',
  size: 'Please shorten your response.',
  invitation: 'Please open your individual invitation link to send a response.',
  email: 'Please enter a valid email address for this response.',
  name: 'Please add your name for the response, using 60 characters or fewer.',
  interest: 'Choose how interested you are.',
  experience: 'Choose an experience option.',
  selections: 'Please review your selected answers.',
  availability: 'Choose one session or one other availability option.',
  text: 'Please shorten your written response.',
  config: 'Response collection is not configured yet. Please contact the organizer.',
  integrity: 'Response collection needs an organizer check. Please try again later.',
  capacity: 'Response collection has reached its limit. Please contact the organizer.',
  conflict: 'This request ID was already used for different answers. Please contact the organizer before sending again.',
  busy: 'Response collection is busy. Please retry with the same answers in a moment.',
  rate: 'Response collection is busy. Please wait a minute and retry with the same answers.',
  save: 'We couldn’t confirm that your response was saved. Please retry with the same answers.'
};

/** Serves only a nonce-bound HTML bridge. Query parameters cannot choose an origin. */
function doGet(e) {
  // Public, read-only transport diagnostic. No payload or arbitrary query accepted.
  if (isHealthRequest_(e)) {
    return jsonOutput_({ok: true, service: 'staff-rsvp', protocolVersion: 2});
  }
  var nonce = e && e.parameter && e.parameter.channelNonce;
  if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) {
    return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><title>Staff RSVP</title></head><body>Open the staff-session invitation to send a response.</body></html>');
  }
  var template = HtmlService.createTemplateFromFile('Bridge');
  template.parentOriginJson = JSON.stringify(getBridgeConfig_().allowedParentOrigin);
  template.channelNonceJson = JSON.stringify(nonce);
  return template.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Simple CORS request candidate: JSON body under text/plain, without cookies.
 * ContentService follows Google's redirect policy. The deployment's real CORS
 * behavior must be verified before a browser client relies on this route.
 */
function doPost(e) {
  try {
    if (!e || (e.queryString !== null && e.queryString !== undefined && e.queryString !== '') ||
        !e.postData || typeof e.postData.contents !== 'string' ||
        typeof e.postData.type !== 'string' ||
        !/^(?:text\/plain|application\/json)(?:\s*;\s*charset=utf-8)?$/i.test(e.postData.type)) fail_('input');
    var raw = e.postData.contents;
    // Reject before JSON parsing, locks, or any spreadsheet access.
    if (raw.length > RSVP_MAX_INPUT_BYTES_ ||
        Utilities.newBlob(raw, 'application/json').getBytes().length > RSVP_MAX_INPUT_BYTES_) fail_('size');
    var payload;
    try { payload = JSON.parse(raw); } catch (ignored) { fail_('input'); }
    // Share the exact same validation, lock, deduplication and read-back path.
    return jsonOutput_(submitResponse(payload));
  } catch (error) {
    var key = error && error.rsvpErrorKey;
    return jsonOutput_({ok: false, requestId: '', error: Object.prototype.hasOwnProperty.call(RSVP_ERRORS_, key) ? RSVP_ERRORS_[key] : RSVP_ERRORS_.save});
  }
}

function isHealthRequest_(e) {
  if (!e || e.queryString !== 'health=1' || !isRecord_(e.parameter) ||
      Object.keys(e.parameter).length !== 1 || e.parameter.health !== '1') return false;
  if (e.parameters && (!isRecord_(e.parameters) || Object.keys(e.parameters).length !== 1 ||
      !Array.isArray(e.parameters.health) || e.parameters.health.length !== 1 || e.parameters.health[0] !== '1')) return false;
  return true;
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/** The shared append-only operation. It never returns names, answers, or sheet details. */
function submitResponse(payload) {
  var requestId = '';
  var lock = null;
  var locked = false;
  try {
    if (payload && typeof payload.requestId === 'string' && RSVP_REQUEST_ID_.test(payload.requestId)) {
      requestId = payload.requestId;
    }
    var validated = validatePayload_(payload);
    var fingerprint = payloadHash_(validated.fingerprintInput);
    lock = LockService.getScriptLock();
    locked = lock.tryLock(RSVP_LOCK_TIMEOUT_MS_);
    if (!locked) fail_('busy');

    var properties = PropertiesService.getScriptProperties();
    var spreadsheetId = properties.getProperty('RSVP_SPREADSHEET_ID');
    var sheetName = properties.getProperty('RSVP_SHEET_NAME') || 'Responses';
    if (typeof spreadsheetId !== 'string' || !spreadsheetId.trim() ||
        typeof sheetName !== 'string' || !sheetName.trim() || sheetName.length > 100 || /[:\\/?*\[\]]/.test(sheetName)) {
      fail_('config');
    }
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId.trim());
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    ensureHeaders_(sheet);

    // The durable sheet, rather than a transient cache, is the deduplication source.
    // Only request IDs/hashes are scanned; no previous response is returned.
    var lastRow = sheet.getLastRow();
    // Cap reads as well as writes. Do not scan an unexpectedly oversized sheet.
    if (lastRow > RSVP_MAX_RESPONSES_ + 1) fail_('capacity');
    var matchingRow = 0;
    if (lastRow > 1) {
      var metadata = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
      for (var i = 0; i < metadata.length; i++) {
        if (metadata[i][0] === requestId) {
          if (matchingRow) fail_('integrity');
          if (metadata[i][1] !== fingerprint) fail_('conflict');
          matchingRow = i + 2;
        }
      }
    }
    if (matchingRow) {
      var originalTimestamp = sheet.getRange(matchingRow, 1, 1, 1).getValues()[0][0];
      if (typeof originalTimestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(originalTimestamp)) fail_('integrity');
      verifyStoredRow_(sheet, matchingRow, makeRow_(originalTimestamp, requestId, fingerprint, validated));
      // A committed identical retry bypasses the new-attempt throttle.
      return {ok: true, requestId: requestId};
    }

    // Old envelopes are accepted only as exact, already-committed retries.
    if (RSVP_REQUIRE_RECIPIENT_ && !validated.recipientId) fail_('invitation');
    if (lastRow >= RSVP_MAX_RESPONSES_ + 1) fail_('capacity');
    reserveNewAttempt_(properties, Date.now());
    var rowNumber = lastRow + 1;
    if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rowNumber - sheet.getMaxRows());
    var row = makeRow_(new Date().toISOString(), requestId, fingerprint, validated);
    // One rectangular write; never clear or overwrite an existing response row.
    sheet.getRange(rowNumber, 1, 1, RSVP_HEADERS_.length).setNumberFormat('@').setValues([row]);
    SpreadsheetApp.flush();
    verifyStoredRow_(sheet, rowNumber, row);
    return {ok: true, requestId: requestId};
  } catch (error) {
    // Do not relay Google errors, spreadsheet IDs, submitted text, or stack traces.
    var key = error && error.rsvpErrorKey;
    return {ok: false, requestId: requestId, error: Object.prototype.hasOwnProperty.call(RSVP_ERRORS_, key) ? RSVP_ERRORS_[key] : RSVP_ERRORS_.save};
  } finally {
    if (locked) {
      // The append is flushed while this lock is held. A failed release cannot turn
      // a verified commit into a false failure; Apps Script also releases on exit.
      try { lock.releaseLock(); } catch (ignored) {}
    }
  }
}

function getBridgeConfig_() {
  return {allowedParentOrigin: RSVP_PARENT_ORIGIN_, protocolVersion: 1};
}

function fail_(key) {
  var error = new Error('RSVP request rejected');
  error.rsvpErrorKey = key;
  throw error;
}

function isRecord_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function exactKeys_(record, allowed, required) {
  var keys = Object.keys(record);
  if (keys.some(function (key) { return allowed.indexOf(key) === -1; }) ||
      required.some(function (key) { return !Object.prototype.hasOwnProperty.call(record, key); })) fail_('input');
}

function validatePayload_(payload) {
  if (!isRecord_(payload)) fail_('input');
  exactKeys_(payload, ['requestId', 'responseName', 'responseEmail', 'recipientId', 'answers'], ['requestId', 'responseName', 'answers']);
  var serialized;
  try { serialized = JSON.stringify(payload); } catch (ignored) { fail_('input'); }
  // Check UTF-8 bytes, not JS code units. Reject before locks or sheet access.
  if (serialized.length > RSVP_MAX_INPUT_BYTES_ || Utilities.newBlob(serialized, 'application/json').getBytes().length > RSVP_MAX_INPUT_BYTES_) fail_('size');
  if (typeof payload.requestId !== 'string' || !RSVP_REQUEST_ID_.test(payload.requestId)) fail_('input');
  if (typeof payload.responseName !== 'string') fail_('name');
  var name = payload.responseName.trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/u.test(payload.responseName) || !/[\p{L}\p{N}]/u.test(name)) fail_('name');
  var hasEmail = Object.prototype.hasOwnProperty.call(payload, 'responseEmail');
  var email = hasEmail ? normalizeResponseEmail_(payload.responseEmail) : '';
  var hasRecipient = Object.prototype.hasOwnProperty.call(payload, 'recipientId');
  var recipientId = hasRecipient ? payload.recipientId : '';
  if (hasRecipient) {
    if (hasEmail || typeof recipientId !== 'string' || !/^[a-f0-9]{32}$/.test(recipientId)) fail_('invitation');
    var mapped = PropertiesService.getScriptProperties().getProperty('RSVP_RECIPIENT_' + recipientId);
    if (typeof mapped !== 'string' || !mapped) fail_('invitation');
    try { email = normalizeResponseEmail_(mapped); } catch (ignored) { fail_('config'); }
  }
  var answers = payload.answers;
  if (!isRecord_(answers)) fail_('input');
  var required = ['experience', 'tools', 'uses', 'beliefs', 'blockers', 'example', 'question', 'availability'];
  exactKeys_(answers, ['interest'].concat(required), required);
  // Preserve baseline compatibility: an omitted legacy interest stays blank.
  var hasInterest = Object.prototype.hasOwnProperty.call(answers, 'interest');
  if (hasInterest && RSVP_OPTIONS_.interest.indexOf(answers.interest) === -1) fail_('interest');
  if (RSVP_OPTIONS_.experience.indexOf(answers.experience) === -1) fail_('experience');
  ['tools', 'uses', 'beliefs', 'blockers', 'availability'].forEach(function (key) {
    var selected = answers[key];
    var allowed = RSVP_OPTIONS_[key];
    if (!Array.isArray(selected) || selected.length > allowed.length || Object.keys(selected).length !== selected.length ||
        selected.some(function (value, index) { return typeof value !== 'string' || allowed.indexOf(value) === -1 || selected.indexOf(value) !== index; })) fail_(key === 'availability' ? 'availability' : 'selections');
  });
  if (answers.beliefs.length > 2 ||
      (answers.tools.indexOf('I don’t remember') !== -1 && answers.tools.length > 1) ||
      (answers.blockers.indexOf('Nothing in particular') !== -1 && answers.blockers.length > 1)) fail_('selections');
  if (answers.availability.length !== 1) fail_('availability');
  if (typeof answers.example !== 'string' || answers.example.length > 500 ||
      typeof answers.question !== 'string' || answers.question.length > 3000) fail_('text');

  // Fixed field order makes JSON object key ordering irrelevant, while any change
  // to accepted values (including original spacing or array order) changes the hash.
  var exactAnswers = {
    interest: hasInterest ? answers.interest : null,
    experience: answers.experience,
    tools: answers.tools.slice(), uses: answers.uses.slice(),
    beliefs: answers.beliefs.slice(), blockers: answers.blockers.slice(),
    example: answers.example, question: answers.question,
    availability: answers.availability.slice()
  };
  var storedAnswers = {
    interest: hasInterest ? answers.interest : '', experience: answers.experience,
    tools: answers.experience === 'Not yet' ? [] : answers.tools.slice(),
    uses: answers.experience === 'Not yet' ? [] : answers.uses.slice(),
    beliefs: answers.beliefs.slice(), blockers: answers.blockers.slice(),
    example: answers.example.trim(), question: answers.question.trim(),
    availability: answers.availability.slice()
  };
  var fingerprintInput = {version: 1, responseName: payload.responseName, answers: exactAnswers};
  // Preserve legacy hashes exactly, including pending retries from the old site.
  if (hasEmail) { fingerprintInput.version = 2; fingerprintInput.responseEmail = payload.responseEmail; }
  if (hasRecipient) { fingerprintInput.version = 3; fingerprintInput.recipientId = recipientId; }
  return {responseName: name, responseEmail: email, recipientId: recipientId, answers: storedAnswers, fingerprintInput: fingerprintInput};
}

function normalizeResponseEmail_(value) {
 if(typeof value!=='string')fail_('email');
 var email=value.trim();
 if(email.length>254||/[\s\u0000-\u001f\u007f]/u.test(email)||!/^[-A-Za-z0-9.!#$%&'*+\/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email)||email.split('@')[0].length>64||email.startsWith('.')||email.includes('..')||email.includes('.@')||email.split('@')[1].split('.').some(label=>label.length>63))fail_('email');
 return email;
}

function payloadHash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8);
  return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** Neutralize formulas and preserve literal apostrophes, including behind whitespace. */
function safeCell_(value) {
  var text = String(value);
  return /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202f\u2060-\u206f\ufeff]*[=+\-@']/u.test(text) ? "'" + text : text;
}

function makeRow_(timestamp, requestId, fingerprint, validated) {
  var answers = validated.answers;
  return [timestamp, requestId, fingerprint, validated.responseName,
    answers.interest, answers.experience,
    JSON.stringify(answers.tools), JSON.stringify(answers.uses),
    JSON.stringify(answers.beliefs), JSON.stringify(answers.blockers),
    answers.example, answers.question, JSON.stringify(answers.availability), validated.responseEmail
  ].map(safeCell_);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    if (sheet.getMaxColumns() < RSVP_HEADERS_.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), RSVP_HEADERS_.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, RSVP_HEADERS_.length).setValues([RSVP_HEADERS_.slice()]);
    SpreadsheetApp.flush();
  }
  // Only migrate the exact original 13-column schema; never rewrite responses.
  if (sheet.getLastColumn() === RSVP_HEADERS_.length - 1) {
    var legacy = sheet.getRange(1, 1, 1, RSVP_HEADERS_.length - 1);
    if (legacy.getValues()[0].some(function(value,index){return value !== RSVP_HEADERS_[index];}) ||
        legacy.getFormulas()[0].some(function(formula){return formula !== '';})) fail_('integrity');
    if (sheet.getMaxColumns() < RSVP_HEADERS_.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
    sheet.getRange(1, RSVP_HEADERS_.length, 1, 1).setValues([['response_email']]);
    SpreadsheetApp.flush();
  }
  if (sheet.getLastColumn() !== RSVP_HEADERS_.length) fail_('integrity');
  var range = sheet.getRange(1, 1, 1, RSVP_HEADERS_.length);
  var headers = range.getValues()[0];
  if (headers.some(function (value, index) { return value !== RSVP_HEADERS_[index]; }) ||
      range.getFormulas()[0].some(function (formula) { return formula !== ''; })) fail_('integrity');
}

function verifyStoredRow_(sheet, rowNumber, expected) {
  var range = sheet.getRange(rowNumber, 1, 1, RSVP_HEADERS_.length);
  var actual = range.getValues()[0];
  if (range.getFormulas()[0].some(function (formula) { return formula !== ''; })) fail_('integrity');
  if (actual.some(function (value, index) {
    if (value === expected[index]) return false;
    // Sheets can consume a leading escape apostrophe when storing literal text.
    var unescaped = expected[index].slice(1);
    return !(expected[index].charAt(0) === "'" && safeCell_(unescaped) === expected[index] && value === unescaped);
  })) fail_('save');
}

/** Global quota guard, not identity verification or strong anti-abuse protection. */
function reserveNewAttempt_(properties, now) {
  var start = Number(properties.getProperty('RSVP_RATE_START_MS'));
  var count = Number(properties.getProperty('RSVP_RATE_COUNT'));
  if (!Number.isFinite(start) || start <= 0 || now < start || now - start >= RSVP_RATE_WINDOW_MS_) {
    start = now;
    count = 0;
  }
  if (!Number.isInteger(count) || count < 0) count = 0;
  if (count >= RSVP_RATE_LIMIT_) fail_('rate');
  // Reserve before writing so an ambiguous append cannot evade the quota guard.
  properties.setProperties({RSVP_RATE_START_MS: String(start), RSVP_RATE_COUNT: String(count + 1)}, false);
}
