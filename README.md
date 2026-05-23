# UNO No Mercy - Online Multiplayer

A GitHub Pages-friendly UNO No Mercy game with peer-to-peer multiplayer.

[Play on GitHub Pages](https://vihaan44.github.io/uno-no-mercy)

## How to Play

1. Host: click "Host Game", enter your name, and share the 6-character room code.
2. Join: click "Join Game", enter your name, and enter the room code.
3. The host starts the game once at least 2 players are in the room.

## Rules Implemented

- Number cards, Skip, Reverse, Draw 2, Wild, and Wild Draw 4
- No Mercy cards: Wild Draw 6, Wild Discard All, Wild Draw Until Color, Wild Swap Hands, and Skip All
- Draw stacking
- UNO calls and callouts
- Round scoring and first-to-500 game ending

## Technical Notes

- Static frontend in `index.html`
- PeerJS/WebRTC multiplayer, with the host browser acting as the game authority
- Player hands are masked before state is sent to other players
- No backend is required for the GitHub Pages version
