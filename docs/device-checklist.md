# Device checklist (about 10 minutes)

For a real iPhone, and for your children's device (an Android phone or a tablet).
Everything here has been checked in a simulated phone (`npm run e2e`, `npm run
perf`); a simulated phone cannot hear, feel or be dropped, so this is the part only
you can do. Tick each box. If a step fails, write what you saw in **Notes** and paste
the notes back to me. Photos or a short screen recording of anything odd help a lot.

**Before you start:** open the Vercel link for the latest deploy in the phone's
browser (Safari on iPhone, Chrome on Android). Phone volume about half. On an iPhone,
check the **ringer switch** (side of the phone) is not on silent, or you will hear
nothing: that is how iPhones behave.

Device: ____________________  OS version: ____________  Date: ____________

## 1. Install
- [ ] **iPhone:** in Safari tap Share, then "Add to Home Screen", then Add.
      **Android:** tap the "Install" button in the green bar at the top (or Chrome's
      menu, then "Install app").
  - **Pass:** a Snack Attack icon (a yellow grid with a red apple) is on the home
    screen. On Android the green bar goes away once installed.
- [ ] Close the browser tab. Open the game **from the home screen icon**.
  - **Pass:** a cream screen with the icon shows for a moment, then the game opens
    full screen: no browser address bar, nothing cut off by the camera notch or the
    bar at the bottom.

## 2. First launch
- [ ] Open the app. If you see "Who's playing?", tap a picture.
  - **Pass:** the board fills the screen with nothing to scroll. The kid cards are at
    the top, **Go** and the tray are at the bottom, and every button is easy to hit
    with a thumb.
- [ ] Try to pull the board down with a finger, then pinch it, then double-tap a
      square, then press and hold a friend or a kid.
  - **Pass:** the screen doesn't bounce or zoom, no "copy / share / save image" menu
    appears, no text gets highlighted.

## 3. Profile switch
- [ ] Tap the round picture at the top left. Tap another child. Tap the first child
      again.
  - **Pass:** each child's game is as they left it. The streak shows on their picture.
- [ ] Grown-ups' menu: on the "Who's playing?" screen press **and hold** "Grown-ups"
      for a second.
  - **Pass:** the menu opens. A quick tap does nothing but give a hint.

## 4. A full main-mode wave (the 9-year-old's profile)
- [ ] Put a friend out (tap it in the tray, tap a green square), tap a lit square to
      aim it. Press **Go**.
  - **Pass:** snacks fly and you **hear**: a whoosh as they are thrown, a soft pock as
    each friend catches, a bright chime when a kid is fed, a little jig as they dance,
    a wobble for a tummy ache, a sigh for a kid who goes home hungry. The sounds match
    what is on the screen, not a second late. A short tune plays when the wave ends.
    The sounds are gentle, not startling.
  - **Android only:** a tiny buzz on each catch and a short buzz at the end. (iPhones
    don't buzz; that's normal.)
- [ ] The result card appears. Tap "Set up wave 2".
  - **Pass:** the card is fully on screen, its button is easy to hit, and the board is
    as you left it.

## 5. A full Kindy wave (the 4-year-old's profile)
- [ ] Open the Kindy profile. Leave it alone for about 8 seconds.
  - **Pass:** a pointing hand shows what to do, and (with the phone's volume up) a
    voice says it in a few words. There is **no written text** on the screen.
- [ ] Follow the hand until a wave is played. Let your child try if you can.
  - **Pass:** every button is big enough for a small finger. The wave plays with the
    same kind of sounds. After the last kid, a party, then a sleeping sun.

## 6. Sound on and off
- [ ] Switch to the picker, hold "Grown-ups", tap "Change" next to one child, tap
      "Sound: on" so it says "Sound: off". Close it. Play that child's profile.
  - **Pass:** that child's game is silent; the other child's still has sound. The
    child's row in the grown-ups' menu says "sound off".
- [ ] Turn it back on.
  - **Pass:** a small blip plays as you turn it on, and the game has sound again.
- [ ] Close the app completely (swipe it away) and open it again.
  - **Pass:** the sound setting is still how you left it.

## 7. Offline launch
- [ ] Switch on **airplane mode** (and Wi-Fi off). Close the app completely, open it
      from the home screen.
  - **Pass:** it opens as normal, today's puzzle is there, you can play a wave.
- [ ] (Optional, a better test) turn the date forward one day in Settings, open the app
      offline, then **turn the date back**.
  - **Pass:** a different puzzle appears. It still works offline.
- [ ] Turn airplane mode off.

## 8. Rotate
- [ ] Turn the phone on its side.
  - **Pass:** a picture of a phone turning upright covers the game, with no words.
    Turn it back: the game is exactly as it was. (If your phone's rotation lock is on,
    nothing happens: that's fine.)

## 9. Background and resume
- [ ] In the middle of setting up a wave, press the home button / swipe home, wait 30
      seconds, come back. Then do it again during a wave replay.
  - **Pass:** the game is where you left it (during a replay, the result may already be
    showing). Sound still works after you tap once.
- [ ] Lock the phone, unlock it, return to the game. Tap a friend.
  - **Pass:** the sound still plays (the first tap may be silent on an iPhone: that is OK;
    the second must not be).
- [ ] **Android only:** open a sheet (the menu, the shop, a kid's card) and press the
      phone's **Back** button.
  - **Pass:** the sheet closes and you stay in the game. Pressing Back with nothing open
    leaves the app.

## 10. Update
This needs a new deploy to exist. Ask me to push a small change first, or skip it.
- [ ] After a new version is deployed, open the installed app (online) and play for a
      moment. After a wave, look at the result card; also open the menu.
  - **Pass:** a yellow line "A new version is ready." with an **Update** button shows
    **between** waves, in the menu and on the "Who's playing?" screen, **never** while
    snacks are flying and never on the board while you set up. Nothing reloads by itself.
- [ ] Tap **Update**.
  - **Pass:** the app reloads, your game is where you left it, and the yellow line is gone.

## Notes (paste this section back to me)

```
Device / OS / browser:

1 Install:
2 First launch:
3 Profile switch:
4 Main wave (sounds in time? too loud/quiet? buzz?):
5 Kindy wave:
6 Sound on/off:
7 Offline:
8 Rotate:
9 Background / resume / Back:
10 Update:

Anything else (a photo or recording helps):
```
