/**
 * Hardware Sensor Configuration
 * 
 * Defines which channels have current sensors physically installed.
 * This configuration matches the ESP32 hardware setup.
 * 
 * GPIO Pin Mapping:
 * - Light 2: GPIO 34 (ADC1_CH6) → light2Current ✅
 * - Light 3: GPIO 35 (ADC1_CH7) → light3Current ✅
 * - Fan 1:   GPIO 32 (ADC1_CH4) → fan1Current ✅
 * - Custom:  GPIO 39 (ADC1_CH3) → customCurrent ✅
 * 
 * Last Updated: 2026-09-07
 */

export interface SensorConfig {
  /** Channel key (matches Firebase currentSense field prefix) */
  key: 'light2' | 'light3' | 'fan1' | 'custom1';
  
  /** Display label */
  label: string;
  
  /** UI color */
  color: string;
  
  /** Is current sensor physically installed? */
  sensorEnabled: boolean;
  
  /** ESP32 GPIO pin number */
  gpioPin: number;
  
  /** ADC channel name */
  adcChannel: string;
}

/**
 * Current sensor availability configuration
 * 
 * IMPORTANT: Only channels with sensorEnabled=true should:
 * - Display current readings in UI
 * - Trigger mismatch alerts
 * - Contribute to power/energy calculations
 */
export const CURRENT_SENSOR_CONFIG: SensorConfig[] = [
  {
    key: 'light2',
    label: 'Light 2',
    color: '#fbbf24',
    sensorEnabled: true,  // ✅ ACS712 installed on GPIO 34
    gpioPin: 34,
    adcChannel: 'ADC1_CH6',
  },
  {
    key: 'light3',
    label: 'Light 3',
    color: '#f59e0b',
    sensorEnabled: true,  // ✅ ACS712 installed on GPIO 35
    gpioPin: 35,
    adcChannel: 'ADC1_CH7',
  },
  {
    key: 'fan1',
    label: 'Fan 1',
    color: '#60a5fa',
    sensorEnabled: true,  // ✅ ACS712 installed on GPIO 32
    gpioPin: 32,
    adcChannel: 'ADC1_CH4',
  },
  {
    key: 'custom1',
    label: 'Custom',
    color: '#a78bfa',
    sensorEnabled: true,  // ✅ ACS712 installed on GPIO 39
    gpioPin: 39,
    adcChannel: 'ADC1_CH3',
  },
];

/**
 * Get sensor config by channel key
 */
export function getSensorConfig(key: string): SensorConfig | undefined {
  return CURRENT_SENSOR_CONFIG.find(s => s.key === key);
}

/**
 * Get all enabled sensors
 */
export function getEnabledSensors(): SensorConfig[] {
  return CURRENT_SENSOR_CONFIG.filter(s => s.sensorEnabled);
}

/**
 * Check if sensor is enabled for a channel
 */
export function isSensorEnabled(key: string): boolean {
  const config = getSensorConfig(key);
  return config?.sensorEnabled ?? false;
}

/**
 * Relay GPIO configuration (for reference)
 */
export const RELAY_GPIO_CONFIG = {
  light1: 13,
  light2: 14,
  light3: 25,
  fan1: 27,
} as const;
