# Guide: Using the Quick Trigger Feature

The **Trigger Feature** (Text Expansion) lets you define short keywords starting with `:` or `!` (like `:home`, `!gm`, or `:brb`). When you type that trigger in any text box and tap your trigger key (**Tab** or **Space**), AutoTyper instantly erases the keyword and types out your full text naturally.

---

## 1. How It Works at a Glance

```text
Type:    :coffee  +  [Tab]
Result:  ☕ "Hey! Grabbing a quick coffee break, back in 10 minutes!"
```

1. **Write a short trigger tag**: Starts with `:` (colon) or `!` (exclamation mark), e.g., `:phone`, `!discord`, `:brb`.
2. **Press your trigger key**: Hit **Tab** (default) or **Space**.
3. **Instant expansion**: The keyword is automatically erased and replaced with your text.

---

## 2. Setting Up Your First Trigger

### In the Web Simulator:
1. Go to the **Snippets** tab.
2. Click **+ New Snippet** (or edit an existing one).
3. Fill in the **Shortcut Trigger** field:
   - Example: `:myaddr` or `!hi`
   - *Rule:* Must begin with `:` or `!`, followed by letters, numbers, `-`, or `_`.
4. Enter the content you want it to expand into.
5. Save the snippet.

### In the Installed Extension:
- Click the extension icon in your browser toolbar or right-click anywhere and open **Options / Snippet Manager**.
- Add or edit any snippet and assign a trigger keyword in the **Shortcut Trigger** input.

---

## 3. Configuring Your Expansion Key (Tab vs. Space)

You can choose whether triggers expand when you press **Tab** or **Space**:

- Open **Settings / Config**.
- Find **Quick Trigger Key**:
  - **Tab (Recommended)**: Keeps normal typing safe. You can write words like `:smile:` or `!important` in casual sentences without accidentally triggering expansion until you hit Tab.
  - **Space**: Ideal for fast, natural texters who want instant expansion like a phone keyboard.

---

## 4. Personal Everyday Use-Cases & Examples

Here are some real-life ways to use triggers for personal messaging, everyday admin, and social chats:

### 🏠 1. Personal Details You Hate Typing Over & Over
*Never search your notes app for your shipping address or gamer tags again.*

- **Trigger:** `:shipping`
  ```text
  Jane Doe
  Apt 4B, 742 Evergreen Terrace
  Springfield, OR 97477
  Delivery Note: Please leave packages by the side gate.
  ```

- **Trigger:** `:socials`
  ```text
  Discord: pixel_rider#4012 | Steam: https://steamcommunity.com/id/pixelrider
  ```

---

### 💬 2. Quick Chat & Messaging
*Great for Discord, WhatsApp Web, Slack, or gaming lobbies.*

- **Trigger:** `:brb`
  ```text
  AFK for ~5 mins, grabbing water! 🥤
  ```

- **Trigger:** `!gm`
  ```text
  Good morning! Hope you're having a great {{weekday}} so far ☀️
  ```

- **Trigger:** `:decline`
  ```text
  Thanks for inviting me! I'm already booked tonight, but let's definitely catch up next week!
  ```

---

### 📓 3. Daily Journal & Productivity Template
*Inject a structured template into your Notion, Obsidian, or Google Docs daily note.*

- **Trigger:** `!daily`
  ```text
  📅 Date: {{date}} ({{weekday}})
  ⏰ Logged at: {{time}}

  🎯 Top 3 Priorities:
  1. 
  2. 
  3. 

  ✨ Gratitude:
  - 

  📝 Reflection:
  ```

---

### 💼 4. Polite Freelance / Side-Gig Inquiries
*Respond to client messages and emails in 2 seconds.*

- **Trigger:** `:rate`
  ```text
  Hi there! Thanks for reaching out. My standard freelance rate is $85/hr, or a fixed milestone rate depending on scope. Let me know what timeline you have in mind!
  ```

---

## 5. Built-in Dynamic Tags

You can include smart tags inside your expanded text. AutoTyper replaces them on the fly:

| Tag | What It Inserts | Example Output |
| :--- | :--- | :--- |
| `{{date}}` | Today's date | `10/30/2026` |
| `{{time}}` | Current time | `04:15 PM` |
| `{{weekday}}` | Day of the week | `Friday` |
| `{{month}}` | Current month | `October` |
| `{{year}}` | Current year | `2026` |
| `{{timestamp}}`| Full ISO timestamp | `2026-10-30T10:30:00.000Z` |

---

## 6. Pro Tips & Rules of Thumb

1. **Prefixes are mandatory**: Always start your trigger with `:` or `!` (e.g. `:fav`, `!links`). This guarantees your regular words won't get accidentally replaced while typing.
2. **Keep triggers short and intuitive**:
   - `:addr` for address
   - `:phone` for phone number
   - `!meet` for video call links
3. **Tab works in textareas and standard inputs**: When typing in a form or chat input, type `:tag` and tap **Tab**. The keyword disappears and your expanded text starts streaming in.
4. **Emergency Stop**: If you accidentally trigger a long snippet, just tap **Escape** (or click Stop on the floating HUD) to halt typing immediately.
