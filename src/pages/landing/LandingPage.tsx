import { Link } from 'react-router-dom';
import { Home, Zap, Smartphone, Cloud, Mail, MapPin } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                <Home className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">A5X Home</h1>
                <p className="text-xs text-slate-500">by A5X Industries</p>
              </div>
            </div>
            <Link
              to="/login"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center">
        <div className="container mx-auto max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700 font-medium mb-6">
            <Zap className="w-4 h-4" />
            Smart Home. Simplified.
          </div>
          
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Control Your Home
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-700">
              From Anywhere
            </span>
          </h2>
          
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            A5X Home lets you control lights, fans, and appliances using your phone or voice commands through Google Home. Built on reliable ESP32 hardware.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/dashboard"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
            >
              Open Dashboard
            </Link>
            <Link
              to="/register"
              className="px-8 py-3 bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-lg border-2 border-slate-200 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <h3 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Everything You Need for Smart Home Control
          </h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Smartphone className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-xl font-semibold text-slate-900 mb-3">Remote Control</h4>
              <p className="text-slate-600">
                Switch your home devices on or off from anywhere using the web dashboard or mobile app.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Home className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-xl font-semibold text-slate-900 mb-3">Google Home Integration</h4>
              <p className="text-slate-600">
                Use voice commands through Google Assistant: "Hey Google, turn on the living room light."
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Cloud className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-xl font-semibold text-slate-900 mb-3">Real-time Analytics</h4>
              <p className="text-slate-600">
                Track energy usage, runtime, and device status with live analytics and notifications.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Smart Devices Section */}
      <section className="py-16 px-4 bg-white border-t border-slate-200">
        <div className="container mx-auto max-w-6xl">
          <h3 className="text-3xl font-bold text-center text-slate-900 mb-4">
            Smart Home Devices We Build
          </h3>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto">
            A5X Industries manufactures IoT-enabled smart home devices powered by ESP32 microcontrollers, 
            designed for seamless integration with Google Home and mobile apps.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="text-4xl mb-3">💡</div>
              <h4 className="font-semibold text-slate-900 mb-2">Smart Switches</h4>
              <p className="text-sm text-slate-600">
                WiFi-enabled relay modules to control lights, fans, and appliances remotely
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="text-4xl mb-3">🌡️</div>
              <h4 className="font-semibold text-slate-900 mb-2">Sensor Modules</h4>
              <p className="text-sm text-slate-600">
                Temperature, humidity, and motion sensors for smart automation
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="text-4xl mb-3">🤖</div>
              <h4 className="font-semibold text-slate-900 mb-2">ESP32 Controllers</h4>
              <p className="text-sm text-slate-600">
                Custom-programmed microcontroller boards with WiFi and Bluetooth
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="text-4xl mb-3">⚡</div>
              <h4 className="font-semibold text-slate-900 mb-2">Power Monitoring</h4>
              <p className="text-sm text-slate-600">
                Energy consumption tracking and real-time usage analytics
              </p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-900 text-center">
              <strong>Hardware Manufacturing:</strong> A5X Industries designs, assembles, and distributes IoT hardware solutions 
              for residential and commercial smart home automation. All devices are built on ESP32 platform with cloud connectivity 
              through Firebase and integrate with Google Home for voice control.
            </p>
          </div>

          <div className="mt-4 p-6 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-900 text-center">
              <strong>Developer & Manufacturer:</strong> A5X Industries (registered as A5X Industries Private Limited) 
              is both the hardware manufacturer and software developer for A5X Home platform. We handle complete device 
              manufacturing, firmware development, cloud infrastructure, mobile/web app development, and Google Home integration.
            </p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="container mx-auto max-w-4xl">
          <h3 className="text-3xl font-bold text-center text-slate-900 mb-6">
            About A5X Industries
          </h3>
          <p className="text-lg text-slate-600 text-center max-w-3xl mx-auto mb-8">
            A5X Industries Private Limited (CIN: U62099MP2026PTC084577) is a registered IoT and smart home device manufacturer 
            based in Jabalpur, Madhya Pradesh, India. We specialize in developing ESP32-based smart home automation hardware, 
            cloud platforms, robotics kits, and STEM education solutions.
          </p>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <h5 className="font-semibold text-slate-900 mb-1">Location</h5>
                  <p className="text-slate-600 text-sm">
                    270a, New Rajiv Gandhi Ward<br />
                    Trimurti Nagar, Vijay Nagar Colony<br />
                    Jabalpur, Madhya Pradesh 482002<br />
                    India
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <h5 className="font-semibold text-slate-900 mb-1">Contact</h5>
                  <p className="text-slate-600 text-sm">
                    <a href="mailto:support@a5x.in" className="text-blue-600 hover:underline">
                      support@a5x.in
                    </a>
                  </p>
                  <p className="text-slate-500 text-xs mt-2">
                    CIN: U62099MP2026PTC084577<br />
                    GSTIN: 23ABFCA8642R1Z4
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                  <Home className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-white text-lg">A5X Home</span>
              </div>
              <p className="text-sm text-slate-400">
                © 2026 A5X Industries. All rights reserved.
              </p>
            </div>
            
            <div className="flex gap-6 text-sm">
              <Link to="/privacy" className="hover:text-blue-400 transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-blue-400 transition-colors">
                Terms of Service
              </Link>
              <a 
                href="mailto:support@a5x.in" 
                className="hover:text-blue-400 transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
