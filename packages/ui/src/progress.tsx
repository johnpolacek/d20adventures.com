// UI SDK's Progress with no look of its own: callers style its parts. The root is the progressbar, sets
// `--progress-value` and `data-complete`, and the indicator sets its own width from the value.
export { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@ui-sdk/react/progress"
