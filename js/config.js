/* Timeline Brawl: game-wide config. The game name lives here only, so a rename is a one-line change. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  HB.CONFIG = {
    title: 'Timeline Brawl',          // game name (title screen, document title, share text)
    subtitle: 'The Five Crowns',      // campaign name
    tag: 'Trial version',
    // the Horde's levy mechanic (internal key 'levy'),
    // chosen by the owner: 'Blood Tribute' / 'Oathbound'. Change both here only.
    tribute: 'Blood Tribute',         // the demand written into a Treaty of Tribute
    recruits: 'Oathbound',            // the trained recruits who join three turns later
    shareText: (code) => 'Join my Five Crowns room: ' + code,
  };
})(typeof window !== 'undefined' ? window : globalThis);
