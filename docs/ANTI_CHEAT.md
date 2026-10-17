# Anti cheat model (Beat My Score)

What the server does:
1. Issues a run with a seed and an HMAC signed token bound to the guest session, valid 20 minutes.
2. Accepts one submission per run (atomic status claim), so replays and duplicates fail.
3. Rejects results that arrive sooner than the round can be played, or after expiry.
4. Rejects malformed logs: wrong shape, non integers, out of order, out of bounds, more than 420 taps.
5. Replays the taps with the shared engine. That score is the score.
6. Flags runs for review when more than 30 percent of hits land within 120 ms of a target appearing, when there are sustained bursts faster than 25 taps a second, or when a long run is perfect.

Flagged runs stay off leaderboards and cannot be shared until a moderator approves them in `/admin`.

What it does not do: a determined attacker who reads the seed and taps with human like timing will pass. That is true of any client side game. Further hardening options: issue seeds in chunks during play, add server timing checkpoints, and review the top of each daily board by hand.
