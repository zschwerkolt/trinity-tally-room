# Trinity Tally Room

A phone app for the Seat of Trinity election party. The five rows match the printed ballot in order: Coke, Beer, Red Wine, Sprite and White Wine. The host scans each cut paper and checks the handwritten preferences. Ballots and photographs are stored in the browser on that device.

[Open the tally room](https://zschwerkolt.github.io/trinity-tally-room/)

## Before the party

Open the site in Safari or Chrome. To keep an icon on your phone, use **Add to Home Screen** and then open the app from that icon. Use the same browser or installed app throughout the count. Open it online once and wait for **Ready offline**. Use **Practice scan** with a filled spare ballot to check the camera and lighting. A practice ballot stays outside the register.

## During the count

1. Hold the phone above one upright, cut ballot with all five boxes visible. Select **Scan ballots**, allow camera access, and tap **Capture ballot**. **Choose photo** also accepts an existing picture.
2. Check the suggested digits against the photographed boxes. Tap a candidate row and the correct number to change it. Tap **Blank** for a genuinely empty square. Tap **Save & next** and move the paper to the counted pile.
3. Use **Set aside** for uncertain papers and resolve them in **Ballot register**. **Enter manually** provides the same five rows and keypad. Keep the original papers and reconcile the register with the size of the pile.
4. Open **Results** and tap **Reveal first preferences**. Step through the transfers or tap **Play all**. **Share result** produces a PNG with the round totals.

## Counting

This independent party app uses a full, single-seat distribution of preferences in the federal House style. The Victorian state election provides the visual theme. A paper is formal when it has the ranks 1 to 5 once each, including the saved case of a single blank with ranks 1 to 4. The host adjudicates unclear, corrected and informal papers.

The lowest candidate is excluded at each round and their ballots transfer to the next continuing preference. The reveal continues to the final two. For a tied exclusion the count first checks earlier rounds, then offers a recorded draw by lot if needed. A tied final prompts a recheck and can remain undecided.

[AEC counting guide](https://www.aec.gov.au/voting/counting/hor_count.htm) · [AEC ballot formality](https://aec.gov.au/Voting/How_to_vote/Voting_HOR.htm)

## Source and hosting

GitHub Pages serves the static files in `docs/` from the `main` branch. There are no application credentials or runtime package dependencies. The digit model, fonts and artwork are bundled. The service worker precaches the app and scanner. Ballot images and rank entries reside in IndexedDB. Clearing site data removes the count. A separate device or browser has its own register.

For local development run `python3 -m http.server 8000 --directory docs` and open `http://localhost:8000`. Run the counting tests with `node --test tests/count.test.mjs` on a current Node.js version. When modifying cached assets, update the cache version in `docs/sw.js`.

See [asset credits](docs/credits.txt) and [model provenance](docs/digits-model.txt).
