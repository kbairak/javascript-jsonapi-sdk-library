const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    filename: 'jsonapi.js',
    path: path.resolve(__dirname, 'bundle'),
    library: { name: 'jsonapi', type: 'umd' },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: ['source-map-loader', 'babel-loader'],
      }
    ],
  },
  devtool: 'eval-source-map',
};
