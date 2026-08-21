import React, { useState, useRef } from 'react';
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
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
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
              className="w-full px-3 py-2.5 sm:py-2 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
                minHeight: '44px', // Touch-friendly height on mobile
              }}
              placeholder="Enter output name"
            />
          </div>

          {/* Icon Selection */}
          <div className="relative">
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Choose Icon
            </label>
            <button
              ref={iconButtonRef}
              onClick={() => setShowIconPicker(!showIconPicker)}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2.5 sm:py-2 border rounded-lg transition-colors w-full touch-manipulation"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
                minHeight: '44px', // Touch-friendly height on mobile
              }}
            >
              <div style={{ color: editColor }}>
                {getIconById(editIcon)}
              </div>
              <span className="text-sm flex-1 text-left" style={{ color: 'var(--text-secondary)' }}>
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
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Choose Color
            </label>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {predefinedColors.map(colorOption => (
                <button
                  key={colorOption.value}
                  onClick={() => setEditColor(colorOption.value)}
                  disabled={saving}
                  className={`p-2.5 sm:p-2 rounded-lg border-2 transition-all touch-manipulation ${
                    editColor === colorOption.value
                      ? 'scale-105'
                      : ''
                  }`}
                  style={{
                    borderColor: editColor === colorOption.value ? colorOption.value : 'var(--border-color)',
                    background: 'var(--bg-secondary)',
                    minHeight: '44px', // Touch-friendly height on mobile
                    minWidth: '44px',  // Touch-friendly width on mobile
                  }}
                  title={colorOption.name}
                  aria-label={`Select ${colorOption.name} color`}
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
              className={`px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold transition-colors touch-manipulation ${
                saving 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:opacity-90'
              }`}
              style={{
                background: saving ? 'var(--bg-secondary)' : 'rgba(22, 163, 74, 0.15)',
                color: saving ? 'var(--text-tertiary)' : '#16a34a',
                minHeight: '44px', // Touch-friendly height on mobile
              }}
              title="Save changes"
            >
              {saving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check size={16} className="sm:w-[14px] sm:h-[14px]" />
                  <span className="ml-1 sm:hidden">Save</span>
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className={`px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold transition-colors touch-manipulation ${
                saving 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:opacity-90'
              }`}
              style={{
                background: saving ? 'var(--bg-secondary)' : 'rgba(239, 68, 68, 0.15)',
                color: saving ? 'var(--text-tertiary)' : '#ef4444',
                minHeight: '44px', // Touch-friendly height on mobile
              }}
              title="Cancel"
            >
              <X size={16} className="sm:w-[14px] sm:h-[14px]" />
              <span className="ml-1 sm:hidden">Cancel</span>
            </button>
          </div>

          {error && (
            <div
              className="p-2 rounded-lg text-xs font-medium"
              style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}
            >
              {error}
            </div>
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
      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</span>
      <button
        onClick={handleEdit}
        disabled={disabled}
        className={`p-2 sm:p-1.5 rounded-lg transition-all duration-200 touch-manipulation ${
          disabled 
            ? 'opacity-30 cursor-not-allowed' 
            : 'hover:opacity-100'
        }`}
        style={{ 
          background: disabled ? 'transparent' : 'var(--bg-secondary)',
          boxShadow: disabled ? 'none' : 'var(--neo-shadow)',
          border: disabled ? 'none' : '1px solid var(--border-color)',
          minHeight: '44px', // Touch-friendly size
          minWidth: '44px',
        }}
        title="Edit name and icon"
        aria-label="Edit output name and icon"
      >
        <Edit2 size={14} className="sm:w-3 sm:h-3" style={{ color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)' }} />
      </button>
    </div>
  );
}