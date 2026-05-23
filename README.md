# UNO No Mercy — Online Multiplayer

A fully functional UNO No Mercy game running on GitHub Pages with peer-to-peer multiplayer.

🎮 **[Play Now](https://vihaan44.github.io/uno-no-mercy)**

## How to Play

1. **Host**: Click "Host Game", enter your name, share the 6-letter room code
2. **Join**: Click "Join Game", enter your name and the room code
3. Host clicks **START GAME** once everyone is in (2–10 players)

## UNO No Mercy Rules Implemented

### Standard UNO Cards
- Number cards (0–9) in 4 colors
- Skip, Reverse, Draw 2
- Wild, Wild Draw 4

### No Mercy Exclusive Cards
| Card | Effect |
|---|---|
| **Wild Draw 6** | Next player draws 6 (stackable) |
| **Wild Discard All** | Play all your cards at once, pick a color |
| **Wild Draw Until Color** | Target player draws until they get the chosen color |
| **Wild Swap Hands** | Swap your entire hand with any player |
| **Skip All** | Skip every other player; you go again |

### Stacking Rules (No Mercy)
- Draw 2 can be stacked onto Draw 2
- Wild Draw 4 can be stacked onto Draw 2, Draw 4, or Draw 6
- Wild Draw 6 can only be stacked onto Draw 4 or Draw 6
- Stack accumulates until someone must draw

### Calling UNO
- Click the **UNO!** button when you have exactly 1 card
- If you forget, other players can click **CATCH [name]!** to make you draw 2

### Scoring
- Win a round by emptying your hand
- Score = sum of all opponents' remaining card values
- First to **500 points** wins the game

## Technical Architecture

- **Frontend**: Pure HTML/CSS/JS — no build step
- **Multiplayer**: [PeerJS](https://peerjs.com/) WebRTC peer-to-peer
- **Game authority**: Host's browser runs all game logic
- **Hosting**: GitHub Pages (static)

No backend required. The host's browser acts as the game server.
