# Playtests

Gate 2 asks for **10 playtests, at least 3 by people other than the owner, and most of
them wanting another game**. This folder holds one file per playtest. Recording one
takes under a minute.

## Running a playtest

1. Open the game from its web address on a phone (the Vercel address in the main
   README). Installing it to the home screen is optional.
2. Tap **New game** and pick any nation. If it is your first game as the owner, turn on
   **Prediction mode** on the Game tab first: the game will ask "What will they do?"
   before it shows an AI nation's answer, which Gate 2 also grades.
3. Tap **1×** and play. A game is 60 months; at 1x that is about ten minutes. Use the
   Decisions and Projects tabs as you like; you can pause any time.
4. At the end (month 60) the game shows the verdict and **three quick questions**:
   - *Who played?* The owner, or someone else.
   - *Would you play another game?* Yes, not sure, or no.
   - *Which choice felt most interesting?* One line, optional.
   Every question can be skipped.
5. Tap **Save playtest file**. The phone saves `playtest-<date>-<nation>.json`
   (on an iPhone it may ask where; "Save to Files" is fine).
6. Send the file to the owner (message, email, anything).

## Adding a file to the project (owner)

1. On github.com, open the repository, then the `docs/playtests` folder.
2. Click **Add file**, then **Upload files**, and drop in the playtest files.
3. Write "Add playtests" as the message and click **Commit changes**.

## Reading the results

Anyone with the project on a computer can run:

```
npm run harness -- predictions --dir docs/playtests
```

It prints prediction accuracy (Gate 2 line 5) and the playtest tally (line 7): how many
by the owner and by others, the "would you play another game?" answers for each group,
every "most interesting choice" line, and the verdict: PASS, FAIL, or NOT YET (fewer
than 10 files, or fewer than 3 by others).
