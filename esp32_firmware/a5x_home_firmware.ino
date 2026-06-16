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
String DB_PATH = "devices/" + String(DEVICE_ID);

// ── Firebase objects ─────────────────────────────────────────────────────────
FirebaseData   fbdo;
FirebaseData   fbdo_stream;     // separate stream object
FirebaseAuth   auth;
FirebaseConfig config;

// ── State ────────────────────────────────────────────────────────────────────
unsigned long lastHealthMs   = 0;
const unsigned long HEALTH_INTERVAL = 10000; // 10 seconds
bool streamReady = false;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

void setPin(int pin, bool state) {
  digitalWrite(pin, state ? HIGH : LOW);
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
