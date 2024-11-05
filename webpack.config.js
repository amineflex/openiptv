const path = require("path");
const webpack = require("webpack");

module.exports = {
	target: "electron-renderer",
	entry: "./src/index.js",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "bundle.js"
	},
	module: {
		rules: [
			{
				test: /\.jsx?$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-env", "@babel/preset-react"]
					}
				}
			},
			{
				test: /\.css$/,
				use: ["style-loader", "css-loader", "postcss-loader"]
			}
		]
	},
	resolve: {
		extensions: [".js", ".jsx"],
		fallback: {
			fs: require.resolve("browserify-fs"),
			path: require.resolve("path-browserify"),
			crypto: require.resolve("crypto-browserify"),
			stream: require.resolve("stream-browserify"),
			util: require.resolve("util/"),
			assert: require.resolve("assert"),
			os: require.resolve("os-browserify/browser"),
			process: require.resolve("process/browser.js")
		}
	},
	devServer: {
		static: path.join(__dirname, "dist"),
		compress: true,
		port: 3000
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser.js",
			Buffer: ["buffer", "Buffer"]
		})
	],
	mode: "development"
};
