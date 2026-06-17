/**
 * A5X Home Automation — ESP32 Firmware
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Realtime DB paths used:
 *
 *   devices/{DEVICE_ID}/health/lastSeen       ← unix seconds, written every 10s
 *   devices/{DEVICE_ID}/health/wifiStatus     ← "connected" | "disconnected"
 *   devices/{DEVICE_ID}/health/firebaseStatus ← "connected" | "disconnected"
 *   devices/{DEVICE_ID}/health/rssi           ← WiFi signal dBm
 *   devices/{DEVICE_ID}/health/heap           ← free heap bytes
 *   devices/{DEVICE_ID}/health/uptime         ← seconds since boot
 *   devices/{DEVICE_ID}/health/restartCount   ← increments on each boot
 *   devices/{DEVICE_ID}/outputs/light1..3     ← bool, web writes → ESP reads
 *   devices/{DEVICE_ID}/outputs/fan1..2       ← bool
 *   devices/{DEVICE_ID}/outputs/custom1       ← bool
 *   devices/{DEVICE_ID}/outputs/buzzer        ← bool
 *   devices/{DEVICE_ID}/outputs/oledMessage   ← string
 *
 * Dex Bot paths (bots/{DEX_BOT_ID}/...):
 *   bots/{DEX_BOT_ID}/message   ← { text, timestamp } — web writes → ESP32 reads → display
 *   bots/{DEX_BOT_ID}/emotion   ← string              — web writes → ESP32 reads → face
 *
 * Libraries needed (install via Arduino Library Manager):
 *   - Firebase ESP32 Client  by Mobizt  (v4.x)
 *   - ArduinoJson             by Benoit Blanchon
 *   - Adafruit SSD1306        (for OLED, optional)
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>       // Firebase ESP32 Client by Mobizt
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// ── CONFIG — change these ────────────────────────────────────────────────────
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// Firebase project credentials (from your .env / Firebase Console)
#define FIREBASE_HOST    "home-automation-a5x-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSyCjPTuY4QnhRbM8ZmbcNgY49TdfS5poxZQ"

// This device's unique ID — MUST match what you registered in the app
#define DEVICE_ID        "A5X-HA-2847"

// ── DEX BOT CONFIG ───────────────────────────────────────────────────────────
// Set this to the Dex Bot ID registered in the dashboard.
// The bot listens on: bots/{DEX_BOT_ID}/message  and  bots/{DEX_BOT_ID}/emotion
#define DEX_BOT_ID       "YOUR_DEX_BOT_ID"

// Firebase Auth — use anonymous sign-in or email/password
// Leave blank if your RTDB rules allow public read/write (not recommended for prod)
#define USER_EMAIL    ""
#define USER_PASSWORD ""

// ── OUTPUT PINS — adjust to your wiring ─────────────────────────────────────
#define PIN_LIGHT1   26
#define PIN_LIGHT2   27
#define PIN_LIGHT3   14
#define PIN_FAN1     25
#define PIN_FAN2     33
#define PIN_CUSTOM1  32
#define PIN_BUZZER   4

// ── RTDB base path ───────────────────────────────────────────────────────────
String DB_PATH     = "devices/" + String(DEVICE_ID);
String DEX_BOT_PATH = "bots/" + String(DEX_BOT_ID);

// ── Firebase objects ─────────────────────────────────────────────────────────
FirebaseData   fbdo;
FirebaseData   fbdo_stream;       // device outputs stream
FirebaseData   fbdo_dexbot_stream; // dex bot message+emotion stream
FirebaseAuth   auth;
FirebaseConfig config;

// ── State ────────────────────────────────────────────────────────────────────
unsigned long lastHealthMs   = 0;
const unsigned long HEALTH_INTERVAL = 10000; // 10 seconds
bool streamReady    = false;
bool dexStreamReady = false;

// Last seen message timestamp — used to avoid re-processing stale values on reconnect
unsigned long lastMsgTimestamp = 0;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

void setPin(int pin, bool state) {
  digitalWrite(pin, state ? HIGH : LOW);
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS — replace these with your actual display library calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when the web dashboard sends a new message.
 * Replace the Serial.println body with your actual display code.
 *
 * DEBUG LOG: "[DexBot][Message] Received: <text>"  appears in Serial Monitor
 *            when a message arrives from the web dashboard.
 */
void displayMessage(const String& text) {
  Serial.println("[DexBot][Message] ✅ Received from web dashboard: \"" + text + "\"");
  Serial.println("[DexBot][Message] Calling display update...");

  // ── TODO: replace with your display library ──────────────────────────────
  // display.clearDisplay();
  // display.setTextSize(1);
  // display.setCursor(0, 0);
  // display.println(text);
  // display.display();
  // ─────────────────────────────────────────────────────────────────────────

  Serial.println("[DexBot][Message] ✅ Display update called for: \"" + text + "\"");
}

/**
 * Called when the web dashboard changes the emotion.
 * Replace the Serial.println body with your actual face/emotion render code.
 *
 * DEBUG LOG: "[DexBot][Emotion] Received: <emotion>"  appears in Serial Monitor
 *            when an emotion update arrives from the web dashboard.
 */
void displayEmotion(const String& emotion) {
  Serial.println("[DexBot][Emotion] ✅ Received from web dashboard: \"" + emotion + "\"");
  Serial.println("[DexBot][Emotion] Calling face update...");

  // ── TODO: replace with your face/emotion renderer ────────────────────────
  // e.g. drawFace(emotion);
  // ─────────────────────────────────────────────────────────────────────────

  Serial.println("[DexBot][Emotion] ✅ Face update called for: \"" + emotion + "\"");
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE HEALTH to RTDB
// ─────────────────────────────────────────────────────────────────────────────
void writeHealth() {
  String path = DB_PATH + "/health";

  FirebaseJson json;
  json.set("lastSeen",       (int)(millis() / 1000));   // unix-style seconds since boot
  json.set("wifiStatus",     WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");
  json.set("firebaseStatus", Firebase.ready() ? "connected" : "disconnected");
  json.set("rssi",           (int)WiFi.RSSI());
  json.set("heap",           (int)ESP.getFreeHeap());
  json.set("uptime",         (int)(millis() / 1000));

  if (Firebase.updateNode(fbdo, path.c_str(), json)) {
    Serial.println("[Health] Written OK");
  } else {
    Serial.println("[Health] Error: " + fbdo.errorReason());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAM CALLBACK — fires whenever outputs/ node changes in RTDB
// ─────────────────────────────────────────────────────────────────────────────
void streamCallback(FirebaseStream data) {
  Serial.println("[Stream] Path: " + data.dataPath() + "  Type: " + data.dataType());

  String path = data.dataPath();

  if (data.dataType() == "boolean") {
    bool val = data.boolData();

    if      (path == "/light1")  setPin(PIN_LIGHT1,  val);
    else if (path == "/light2")  setPin(PIN_LIGHT2,  val);
    else if (path == "/light3")  setPin(PIN_LIGHT3,  val);
    else if (path == "/fan1")    setPin(PIN_FAN1,     val);
    else if (path == "/fan2")    setPin(PIN_FAN2,     val);
    else if (path == "/custom1") setPin(PIN_CUSTOM1,  val);
    else if (path == "/buzzer")  setPin(PIN_BUZZER,   val);

    Serial.println("[Output] " + path + " = " + String(val ? "ON" : "OFF"));
  }

  if (path == "/oledMessage" && data.dataType() == "string") {
    String msg = data.stringData();
    Serial.println("[OLED] Message: " + msg);
    // Display on OLED if connected:
    // display.clearDisplay();
    // display.setCursor(0,0);
    // display.println(msg);
    // display.display();
  }

  // If root outputs object received (first connect)
  if (data.dataType() == "json") {
    FirebaseJson json;
    json.setJsonData(data.jsonString());

    FirebaseJsonData result;
    if (json.get(result, "light1"))  setPin(PIN_LIGHT1,  result.boolValue);
    if (json.get(result, "light2"))  setPin(PIN_LIGHT2,  result.boolValue);
    if (json.get(result, "light3"))  setPin(PIN_LIGHT3,  result.boolValue);
    if (json.get(result, "fan1"))    setPin(PIN_FAN1,    result.boolValue);
    if (json.get(result, "fan2"))    setPin(PIN_FAN2,    result.boolValue);
    if (json.get(result, "custom1")) setPin(PIN_CUSTOM1, result.boolValue);
    if (json.get(result, "buzzer"))  setPin(PIN_BUZZER,  result.boolValue);
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[Stream] Timeout — reconnecting...");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEX BOT STREAM CALLBACK — fires when bots/{DEX_BOT_ID}/ changes
// Listens to both /message and /emotion under the bot's node.
// ─────────────────────────────────────────────────────────────────────────────
void dexBotStreamCallback(FirebaseStream data) {
  String path = data.dataPath();
  String type = data.dataType();

  Serial.println("[DexBot][Stream] Path: " + path + "  Type: " + type);

  // ── /message node: { text: "...", timestamp: 12345 } ─────────────────────
  // Web dashboard writes bots/{botId}/message as an object with text + timestamp.
  // We use the timestamp to skip stale values replayed on reconnect.
  if (path == "/message") {
    if (type == "json") {
      FirebaseJson json;
      json.setJsonData(data.jsonString());

      FirebaseJsonData textResult;
      FirebaseJsonData tsResult;

      json.get(textResult, "text");
      json.get(tsResult,   "timestamp");

      unsigned long incomingTs = tsResult.success ? (unsigned long)tsResult.intValue : 0;
      String msgText = textResult.success ? textResult.stringValue : "";

      Serial.println("[DexBot][Message] Received — text=\"" + msgText
                     + "\"  timestamp=" + String(incomingTs)
                     + "  lastSeen=" + String(lastMsgTimestamp));

      // Skip if this is a stale value from before the last reboot / reconnect
      if (incomingTs > lastMsgTimestamp) {
        lastMsgTimestamp = incomingTs;
        Serial.println("[DexBot][Message] ✅ New message — forwarding to display");
        displayMessage(msgText);
      } else {
        Serial.println("[DexBot][Message] ⏭  Skipped stale message (already processed)");
      }
    }
    // Fallback: plain string value (older firmware format)
    else if (type == "string") {
      String msgText = data.stringData();
      Serial.println("[DexBot][Message] Received plain string: \"" + msgText + "\"");
      displayMessage(msgText);
    }
  }

  // ── /emotion node: plain string e.g. "happy", "normal", "cool" ───────────
  // Web dashboard writes bots/{botId}/emotion as a plain string.
  // This path already works — logging added for parity with message debug flow.
  else if (path == "/emotion") {
    if (type == "string") {
      String emo = data.stringData();
      Serial.println("[DexBot][Emotion] Received: \"" + emo + "\"");
      displayEmotion(emo);
    }
  }

  // ── Root node received (full object on first connect / reconnect) ─────────
  else if (path == "/" && type == "json") {
    Serial.println("[DexBot][Stream] Root snapshot received — parsing initial state");

    FirebaseJson json;
    json.setJsonData(data.jsonString());

    // Restore emotion
    FirebaseJsonData emoResult;
    if (json.get(emoResult, "emotion") && emoResult.success) {
      Serial.println("[DexBot][Emotion] Initial state: \"" + emoResult.stringValue + "\"");
      displayEmotion(emoResult.stringValue);
    }

    // Restore message (only if timestamp is newer than last seen)
    FirebaseJsonData msgTextResult, msgTsResult;
    if (json.get(msgTextResult, "message/text") && msgTextResult.success) {
      json.get(msgTsResult, "message/timestamp");
      unsigned long incomingTs = msgTsResult.success ? (unsigned long)msgTsResult.intValue : 0;

      Serial.println("[DexBot][Message] Initial state — text=\"" + msgTextResult.stringValue
                     + "\"  timestamp=" + String(incomingTs));

      if (incomingTs > lastMsgTimestamp) {
        lastMsgTimestamp = incomingTs;
        displayMessage(msgTextResult.stringValue);
      }
    }
  }
}

void dexBotStreamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[DexBot][Stream] Timeout — will reconnect automatically");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Output pins
  int pins[] = { PIN_LIGHT1, PIN_LIGHT2, PIN_LIGHT3,
                 PIN_FAN1, PIN_FAN2, PIN_CUSTOM1, PIN_BUZZER };
  for (int p : pins) {
    pinMode(p, OUTPUT);
    digitalWrite(p, LOW);
  }

  // WiFi connect
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());

  // Firebase config
  config.api_key     = FIREBASE_API_KEY;
  config.database_url = FIREBASE_HOST;
  config.token_status_callback = tokenStatusCallback;

  // Auth — anonymous (enable Anonymous sign-in in Firebase Console → Authentication)
  // OR use email/password if you have them set
  if (strlen(USER_EMAIL) > 0) {
    auth.user.email    = USER_EMAIL;
    auth.user.password = USER_PASSWORD;
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Wait for Firebase to be ready
  Serial.print("[Firebase] Initializing");
  while (!Firebase.ready()) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\n[Firebase] Ready!");

  // Write initial health immediately
  writeHealth();

  // Start streaming outputs/ node
  String streamPath = DB_PATH + "/outputs";
  if (!Firebase.beginStream(fbdo_stream, streamPath.c_str())) {
    Serial.println("[Stream] Begin failed: " + fbdo_stream.errorReason());
  } else {
    Firebase.setStreamCallback(fbdo_stream, streamCallback, streamTimeoutCallback);
    streamReady = true;
    Serial.println("[Stream] Listening on: " + streamPath);
  }

  // ── Start Dex Bot stream: bots/{DEX_BOT_ID}/ ─────────────────────────────
  // Listens to /message and /emotion under the bot node in RTDB.
  // This is the same Firebase project as the device outputs stream.
  // Web dashboard writes:
  //   bots/{botId}/message  → { text, timestamp }  — triggers displayMessage()
  //   bots/{botId}/emotion  → "happy" | "normal" … — triggers displayEmotion()
  //
  // DEBUG: open Serial Monitor at 115200 baud to see incoming values.
  String dexBotStreamPath = DEX_BOT_PATH;
  if (!Firebase.beginStream(fbdo_dexbot_stream, dexBotStreamPath.c_str())) {
    Serial.println("[DexBot][Stream] Begin failed: " + fbdo_dexbot_stream.errorReason());
  } else {
    Firebase.setStreamCallback(fbdo_dexbot_stream, dexBotStreamCallback, dexBotStreamTimeoutCallback);
    dexStreamReady = true;
    Serial.println("[DexBot][Stream] ✅ Listening on: " + dexBotStreamPath);
    Serial.println("[DexBot][Stream]   /message → displayMessage()");
    Serial.println("[DexBot][Stream]   /emotion → displayEmotion()");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  // Write health every 10 seconds → web app sees Online
  if (millis() - lastHealthMs >= HEALTH_INTERVAL) {
    lastHealthMs = millis();
    writeHealth();
  }

  // WiFi reconnect if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.reconnect();
    delay(2000);
  }
}
