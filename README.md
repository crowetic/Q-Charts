# Q-Charts

Q-Charts is a Qortal trade charting application that pulls data from the chain, and draws charts that any trader should be familiar with.

## Features and Function

Q-Trade by default will pull ALL trade data from the chain, and save it to localstorage, in a trade data cache.
There is now a clear cache button and a fetch new trades button that can be clicked at any point to incrementally fetch new trades.

### Daily Candle Defaults

The default of the drawn trade charts are with 1D candles, as they seem to look the best for the majority of Qortal Charts at the moment. Going below 2W threshold for the drawing of the charts didn't look great, so that is default minimum.

### Volume Pop-Up

Volume for any given candle will be displayed in a pop-up upon mouseover of that candle. Volume charts were not behaving correctly, but may be re-added added in the future.
