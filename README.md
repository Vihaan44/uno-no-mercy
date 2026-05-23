# UNO No Mercy - Online Multiplayer

A GitHub Pages-friendly UNO No Mercy game with peer-to-peer multiplayer.

[Play on GitHub Pages](https://vihaan44.github.io/uno-no-mercy)

## How to Play

1. Host: click "Host Game", enter your name, and share the 6-character room code.
2. Join: click "Join Game", enter your name, and enter the room code.
3. The host starts the game once at least 2 players are in the room.

## Rules Implemented

- Correct custom deck breakdown from the request
- Number cards, Skip, Skip All, Reverse, Draw 2, Draw 4, and Discard All of Color
- Wild Reverse Draw 4, Wild Draw 6, Wild Draw 10, and Color Roulette
- 0 passes all hands in turn direction
- 7 swaps hands with a chosen player
- Draw stacking by equal-or-higher draw value
- Draw until playable when you cannot play
- Color Roulette stacking: each roulette player chooses a color, then the next player draws face up until all chosen colors appear
- Mercy elimination at 25 cards
- UNO calls and callouts
- No points system

## Technical Notes

- Static frontend in `index.html`
- Game logic in `app.js`
- Styling in `styles.css`
- PeerJS/WebRTC multiplayer, with the host browser acting as the game authority
- Player hands are masked before state is sent to other players
- No backend is required for the GitHub Pages version
