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

  // Handle outside click and positioning
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

    // Position the picker to ensure it fits in viewport
    const updatePosition = () => {
      if (!popoverRef.current || !anchorRef?.current) return;
      
      const rect = anchorRef.current.getBoundingClientRect();
      const picker = popoverRef.current;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const pickerWidth = 320; // w-80 = 320px
      const pickerHeight = 400; // max height
      
      // Reset position classes
      picker.classList.remove('right-0');
      picker.style.left = '';
      picker.style.right = '';
      picker.style.transform = '';
      
      // Check if picker would overflow right edge
      if (rect.left + pickerWidth > viewportWidth - 24) {
        // Position from right edge of viewport with 24px margin
        picker.style.right = '12px';
        picker.style.left = 'auto';
      }
      
      // Check if picker would overflow bottom edge
      if (rect.bottom + pickerHeight > viewportHeight - 24) {
        // Position above the anchor instead
        picker.style.top = 'auto';
        picker.style.bottom = '100%';
        picker.style.marginTop = '0';
        picker.style.marginBottom = '4px';
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    
    // Initial positioning
    updatePosition();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-24px)] rounded-xl shadow-xl border transition-colors duration-200"
      style={{
        maxHeight: 'min(400px, calc(100vh - 200px))',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
        boxShadow: 'var(--neo-shadow-lg)',
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 flex-shrink-0 transition-colors duration-200" 
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Choose Icon</h3>
        <button
          onClick={onClose}
          className="p-2 sm:p-1 rounded-md transition-colors touch-manipulation"
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            minHeight: '44px', // Touch-friendly on mobile
            minWidth: '44px',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
          title="Close"
          aria-label="Close icon picker"
        >
          <X size={16} className="sm:w-[14px] sm:h-[14px]" />
        </button>
      </div>

      {/* Search */}
      <div 
        className="p-3 flex-shrink-0 transition-colors duration-200" 
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="relative">
          <Search size={16} className="sm:w-[14px] sm:h-[14px] absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search icons..."
            className="w-full pl-10 sm:pl-8 pr-3 py-2.5 sm:py-1.5 border rounded-lg text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-color)',
              minHeight: '44px', // Touch-friendly on mobile
            }}
          />
        </div>
      </div>

      {/* Categories */}
      <div 
        className="px-3 py-2 flex-shrink-0 transition-colors duration-200" 
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex flex-wrap gap-1.5 sm:gap-1">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-3 py-2 sm:px-2 sm:py-0.5 text-xs sm:text-[10px] font-medium rounded-md transition-colors touch-manipulation ${
                selectedCategory === category.id
                  ? ''
                  : ''
              }`}
              style={{
                background: selectedCategory === category.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                color: selectedCategory === category.id ? '#2563eb' : 'var(--text-secondary)',
                minHeight: '36px', // Touch-friendly but smaller than full buttons
              }}
              onMouseEnter={(e) => {
                if (selectedCategory !== category.id) {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectedCategory === category.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)';
              }}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Icon Grid - Scrollable */}
      <div className="overflow-y-auto flex-1 p-3">
        {filteredIcons.length > 0 ? (
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-1.5">
            {filteredIcons.map(icon => (
              <button
                key={icon.id}
                onClick={() => onIconSelect(icon.id)}
                className={`p-3 sm:p-2 rounded-lg border transition-all duration-200 touch-manipulation ${
                  selectedIcon === icon.id
                    ? ''
                    : ''
                }`}
                style={{
                  borderColor: selectedIcon === icon.id ? '#2563eb' : 'var(--border-color)',
                  background: selectedIcon === icon.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                  minHeight: '48px', // Touch-friendly size
                  minWidth: '48px',
                }}
                onMouseEnter={(e) => {
                  if (selectedIcon !== icon.id) {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.borderColor = 'var(--text-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = selectedIcon === icon.id ? '#2563eb' : 'var(--border-color)';
                  e.currentTarget.style.background = selectedIcon === icon.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)';
                }}
                title={icon.label}
                aria-label={`Select ${icon.label} icon`}
              >
                <div 
                  className={`flex items-center justify-center`}
                  style={{
                    color: selectedIcon === icon.id ? '#2563eb' : 'var(--text-secondary)'
                  }}
                >
                  {icon.icon}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No icons found matching "{searchTerm}"
          </div>
        )}
      </div>

      {/* Selected Icon Info */}
      {selectedIcon && (
        <div 
          className="p-3 sm:p-2.5 flex-shrink-0 transition-colors duration-200" 
          style={{ 
            background: 'var(--bg-secondary)', 
            borderTop: '1px solid var(--border-color)' 
          }}
        >
          <div className="flex items-center gap-2">
            <div style={{ color: '#2563eb' }}>
              {getIconById(selectedIcon)}
            </div>
            <span className="text-sm sm:text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {ICON_OPTIONS.find(i => i.id === selectedIcon)?.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}