import React, { useState, useEffect, useRef } from 'react';
import {
  Lightbulb, Sun, Moon, Lamp, Flashlight,
  Wind, AirVent, Snowflake, Thermometer, Fan,
  Zap, Power, Plug, Cpu, Settings,
  Bed, Sofa, Home, DoorOpen, Wind as WindowIcon,
  Book, Monitor, Tv, Speaker, Bell,
  Droplet, ShowerHead, Hammer, Wrench, Flame,
  Search, X
} from 'lucide-react';

export interface IconOption {
  id: string;
  icon: React.ReactNode;
  label: string;
  category: 'lighting' | 'climate' | 'power' | 'rooms' | 'entertainment' | 'utilities';
}

export const ICON_OPTIONS: IconOption[] = [
  // Lighting
  { id: 'lightbulb', icon: <Lightbulb size={20} />, label: 'Light Bulb', category: 'lighting' },
  { id: 'sun', icon: <Sun size={20} />, label: 'Bright Light', category: 'lighting' },
  { id: 'moon', icon: <Moon size={20} />, label: 'Night Light', category: 'lighting' },
  { id: 'lamp', icon: <Lamp size={20} />, label: 'Lamp', category: 'lighting' },
  { id: 'flashlight', icon: <Flashlight size={20} />, label: 'Flashlight', category: 'lighting' },

  // Climate
  { id: 'wind', icon: <Wind size={20} />, label: 'Fan', category: 'climate' },
  { id: 'air-vent', icon: <AirVent size={20} />, label: 'Air Vent', category: 'climate' },
  { id: 'snowflake', icon: <Snowflake size={20} />, label: 'Cooling', category: 'climate' },
  { id: 'thermometer', icon: <Thermometer size={20} />, label: 'Temperature', category: 'climate' },
  { id: 'fan', icon: <Fan size={20} />, label: 'Ceiling Fan', category: 'climate' },
  { id: 'flame', icon: <Flame size={20} />, label: 'Heater', category: 'climate' },

  // Power & Electronics
  { id: 'zap', icon: <Zap size={20} />, label: 'Power', category: 'power' },
  { id: 'power', icon: <Power size={20} />, label: 'Power Button', category: 'power' },
  { id: 'plug', icon: <Plug size={20} />, label: 'Plug', category: 'power' },
  { id: 'cpu', icon: <Cpu size={20} />, label: 'Device', category: 'power' },
  { id: 'settings', icon: <Settings size={20} />, label: 'Settings', category: 'power' },

  // Rooms & Furniture
  { id: 'bed', icon: <Bed size={20} />, label: 'Bedroom', category: 'rooms' },
  { id: 'sofa', icon: <Sofa size={20} />, label: 'Living Room', category: 'rooms' },
  { id: 'home', icon: <Home size={20} />, label: 'Home', category: 'rooms' },
  { id: 'door', icon: <DoorOpen size={20} />, label: 'Door', category: 'rooms' },
  { id: 'window', icon: <WindowIcon size={20} />, label: 'Window', category: 'rooms' },
  { id: 'book', icon: <Book size={20} />, label: 'Study', category: 'rooms' },

  // Entertainment
  { id: 'monitor', icon: <Monitor size={20} />, label: 'Monitor', category: 'entertainment' },
  { id: 'tv', icon: <Tv size={20} />, label: 'TV', category: 'entertainment' },
  { id: 'speaker', icon: <Speaker size={20} />, label: 'Speaker', category: 'entertainment' },
  { id: 'bell', icon: <Bell size={20} />, label: 'Bell', category: 'entertainment' },

  // Utilities
  { id: 'droplet', icon: <Droplet size={20} />, label: 'Water', category: 'utilities' },
  { id: 'shower', icon: <ShowerHead size={20} />, label: 'Shower', category: 'utilities' },
  { id: 'hammer', icon: <Hammer size={20} />, label: 'Tool', category: 'utilities' },
  { id: 'wrench', icon: <Wrench size={20} />, label: 'Maintenance', category: 'utilities' },
];

export function getIconById(iconId: string): React.ReactNode {
  const iconOption = ICON_OPTIONS.find(option => option.id === iconId);
  return iconOption?.icon || <Zap size={20} />;
}

interface IconPickerProps {
  selectedIcon: string;
  onIconSelect: (iconId: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

export default function IconPicker({ selectedIcon, onIconSelect, onClose, anchorRef }: IconPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const popoverRef = useRef<HTMLDivElement>(null);

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'lighting', label: 'Lights' },
    { id: 'climate', label: 'Climate' },
    { id: 'power', label: 'Power' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'entertainment', label: 'Media' },
    { id: 'utilities', label: 'Utils' },
  ];

  const filteredIcons = ICON_OPTIONS.filter(icon => {
    const matchesSearch = icon.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         icon.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || icon.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-neutral-200"
      style={{
        maxHeight: 'min(400px, calc(100vh - 200px))',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-200 flex-shrink-0">
        <h3 className="text-xs font-semibold text-neutral-900">Choose Icon</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-neutral-100 text-neutral-400 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-neutral-200 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search icons..."
            className="w-full pl-8 pr-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-3 py-2 border-b border-neutral-200 flex-shrink-0">
        <div className="flex flex-wrap gap-1">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                selectedCategory === category.id
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Icon Grid - Scrollable */}
      <div className="overflow-y-auto flex-1 p-3">
        {filteredIcons.length > 0 ? (
          <div className="grid grid-cols-6 gap-1.5">
            {filteredIcons.map(icon => (
              <button
                key={icon.id}
                onClick={() => onIconSelect(icon.id)}
                className={`p-2 rounded-lg border transition-all duration-200 hover:bg-neutral-50 ${
                  selectedIcon === icon.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
                title={icon.label}
              >
                <div className={`flex items-center justify-center ${
                  selectedIcon === icon.id ? 'text-primary-600' : 'text-neutral-600'
                }`}>
                  {icon.icon}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-neutral-500">
            No icons found matching "{searchTerm}"
          </div>
        )}
      </div>

      {/* Selected Icon Info */}
      {selectedIcon && (
        <div className="p-2.5 bg-neutral-50 border-t border-neutral-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="text-primary-600">
              {getIconById(selectedIcon)}
            </div>
            <span className="text-xs font-medium text-neutral-700">
              {ICON_OPTIONS.find(i => i.id === selectedIcon)?.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}