import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import IconPicker, { getIconById } from './IconPicker';

interface EditableOutputLabelProps {
  name: string;
  icon: string;
  color: string;
  onSave: (name: string, icon: string, color: string) => Promise<void>;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  iconSize?: number;
}

export default function EditableOutputLabel({
  name,
  icon,
  color,
  onSave,
  disabled = false,
  maxLength = 40,
  className = '',
  iconSize = 19,
}: EditableOutputLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editIcon, setEditIcon] = useState(icon);
  const [editColor, setEditColor] = useState(color);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  const predefinedColors = [
    { name: 'Yellow', value: '#d97706' },
    { name: 'Blue', value: '#2563eb' },
    { name: 'Purple', value: '#7c3aed' },
    { name: 'Green', value: '#16a34a' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Cyan', value: '#06b6d4' },
  ];

  const handleEdit = () => {
    if (disabled) return;
    setEditName(name);
    setEditIcon(icon);
    setEditColor(color);
    setIsEditing(true);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    if (trimmed.length > maxLength) {
      setError(`Name must be ${maxLength} characters or less`);
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed, editIcon, editColor);
      setIsEditing(false);
      setShowIconPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditName(name);
    setEditIcon(icon);
    setEditColor(color);
    setIsEditing(false);
    setShowIconPicker(false);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showIconPicker) {
      handleSave();
    } else if (e.key === 'Escape') {
      if (showIconPicker) {
        setShowIconPicker(false);
      } else {
        handleCancel();
      }
    }
  };

  const handleIconSelect = (iconId: string) => {
    setEditIcon(iconId);
    setShowIconPicker(false);
  };

  if (isEditing) {
    return (
      <div className={`editable-output-editing ${className}`}>
        <div className="space-y-3">
          {/* Name Input */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Output Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={maxLength}
              disabled={saving}
              autoFocus
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Enter output name"
            />
          </div>

          {/* Icon Selection */}
          <div className="relative">
            <label className="block text-xs font-medium text-neutral-600 mb-2">
              Choose Icon
            </label>
            <button
              ref={iconButtonRef}
              onClick={() => setShowIconPicker(!showIconPicker)}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors w-full"
            >
              <div style={{ color: editColor }}>
                {getIconById(editIcon)}
              </div>
              <span className="text-sm text-neutral-700">
                Click to change icon
              </span>
            </button>
            
            {showIconPicker && (
              <IconPicker
                selectedIcon={editIcon}
                onIconSelect={handleIconSelect}
                onClose={() => setShowIconPicker(false)}
                anchorRef={iconButtonRef}
              />
            )}
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-2">
              Choose Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {predefinedColors.map(colorOption => (
                <button
                  key={colorOption.value}
                  onClick={() => setEditColor(colorOption.value)}
                  disabled={saving}
                  className={`p-2.5 rounded-lg border-2 transition-all ${
                    editColor === colorOption.value
                      ? 'border-neutral-800 scale-105'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                  title={colorOption.name}
                >
                  <div
                    className="w-6 h-6 rounded-md mx-auto"
                    style={{
                      backgroundColor: colorOption.value,
                      boxShadow: editColor === colorOption.value ? `0 0 8px ${colorOption.value}60` : 'none',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                saving 
                  ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
              title="Save changes"
            >
              {saving ? '...' : <Check size={14} />}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                saving 
                  ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed' 
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`editable-output-display flex items-center gap-2 ${className}`}>
      <div style={{ color: color }}>
        {getIconById(icon)}
      </div>
      <span className="text-sm font-bold text-neutral-800">{name}</span>
      <button
        onClick={handleEdit}
        disabled={disabled}
        className={`p-1.5 rounded-lg transition-all ${
          disabled 
            ? 'opacity-30 cursor-not-allowed' 
            : 'hover:bg-neutral-100 hover:shadow-sm opacity-70 hover:opacity-100'
        }`}
        style={{ background: disabled ? 'transparent' : '#EEF2F7' }}
        title="Edit name and icon"
      >
        <Edit2 size={12} style={{ color: disabled ? '#9ca3af' : '#6b7280' }} />
      </button>
    </div>
  );
}