# Color-Matched Notifications - Quick Reference

## What It Does
Notifications automatically use the custom color you assign to each output (Light, Fan, Custom Device).

---

## How It Works

### 1. Set Output Colors
In Device Details → Customize any output's color using the color picker

### 2. Notifications Match Automatically
- Light 1 = Orange → Notifications appear with orange accent
- Light 2 = Pink → Notifications appear with pink accent
- Fan 1 = Green → Notifications appear with green accent

### 3. Instant Updates
Change an output's color → Future notifications immediately use the new color

---

## Visual Indicators

### Notification Bell Panel
- **Left Border**: 3px colored accent bar
- **Icon**: Colored with soft glow
- **Background**: Very subtle color tint
- **Unread Dot**: Uses output color

### Toast Popups
- **Left Border**: 3px colored accent bar
- **Icon**: Colored with glow effect
- **Background**: Subtle gradient tint
- **Shadow**: Soft colored glow

---

## Renamed Outputs
Works with renamed outputs too!
- "Kitchen Light" → Uses Light 1's color
- "Ceiling Fan" → Uses Fan 1's color
- "Bedroom Lamp" → Uses Light 2's color

---

## Fallback Colors
If no color is set, uses smart defaults:
- Lights ON: Amber
- Lights OFF: Gray
- Fans ON: Cyan
- Fans OFF: Gray
- Device Online: Green
- Device Offline: Orange

---

## Examples

**Orange Light (#ff8800)**
```
┌─────────────────────────────────┐
│ ▎ 💡 Light 1 turned ON          │ ← Orange border
│   Kitchen • just now             │
└─────────────────────────────────┘
```

**Pink Light (#ff69b4)**
```
┌─────────────────────────────────┐
│ ▎ 💡 Light 2 turned ON          │ ← Pink border
│   Bedroom • just now             │
└─────────────────────────────────┘
```

**Green Fan (#00ff88)**
```
┌─────────────────────────────────┐
│ ▎ 🌀 Fan 1 turned ON            │ ← Green border
│   Living Room • just now         │
└─────────────────────────────────┘
```

---

## Testing Your Colors

1. **Set a Color**: Go to Devices → Device Details → Edit output color
2. **Toggle Output**: Turn the output ON or OFF
3. **Check Bell**: Open notification panel - see colored accent
4. **Check Toast**: Watch for popup - see colored accent
5. **Change Color**: Update the color and repeat

---

## Troubleshooting

**Notification has no color?**
- Output may not have a custom color set
- Uses fallback color (amber for lights, cyan for fans)
- This is normal behavior

**Wrong color showing?**
- Wait a few seconds for metadata to sync
- Refresh the page if needed
- Check that the correct output was toggled

**No notifications appearing?**
- Check if notifications are paused
- Look for bell icon with slash (paused state)
- Resume notifications if needed

---

## Accessibility

- ✅ Respects reduced motion preferences
- ✅ High contrast maintained
- ✅ Keyboard navigation supported
- ✅ Screen reader friendly
- ✅ Color is accent only (not sole indicator)

---

## Performance

- Minimal performance impact
- No additional network requests
- Colors cached during session
- Instant color updates

---

**Quick Tip**: Use distinctive colors for frequently used outputs to quickly identify notifications at a glance!

**Example Color Scheme:**
- Kitchen Light: 🟠 Orange
- Bedroom Light: 🩷 Pink  
- Living Room Fan: 🟢 Green
- Bathroom Light: 🔵 Blue
- Garage Light: 🟣 Purple
