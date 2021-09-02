const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    filename: 'jsonapi.js',
    path: path.resolve(__dirname, 'bundle'),
    library: 'jsonapi',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: { loader: 'babel-loader' },
      }
    ],
  },
};
