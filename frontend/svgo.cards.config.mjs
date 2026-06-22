// SVGO config used to optimise the bundled Byron Knoll deck (see README "Cards
// & assets"). floatPrecision 1 is visually lossless at card display sizes and
// cuts the raw deck ~60%. Regenerate from the upstream cards-svg/ folder:
//
//   npx svgo -f <upstream>/cards-svg -o public/cards \
//       --config svgo.cards.config.mjs --multipass
//
export default {
  multipass: true,
  floatPrecision: 1,
  plugins: [
    { name: "preset-default", params: { overrides: { removeViewBox: false } } },
    "removeDimensions", // let the cards scale via CSS
  ],
};
