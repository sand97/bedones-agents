<wizard-report>
# PostHog post-wizard report

The wizard has completed a PostHog analytics integration for the `image-cropper` FastAPI microservice. Here's what was done:

- Added `posthog>=3.0.0` to `services/image-cropper/requirements.txt`
- Created `services/image-cropper/.env` with `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`
- Modified `services/image-cropper/app.py`:
  - Added a FastAPI `lifespan` context manager that initialises `posthog.api_key` / `posthog.host` on startup and calls `posthog.flush()` on shutdown
  - Instrumented the `/crop/opencv` endpoint with three server-side events (see table)
  - Added `posthog.capture_exception()` in the catch-all exception handler for automatic error tracking

| Event | Description | File |
|---|---|---|
| `image_crop_requested` | An image was submitted for cropping; includes `file_size_bytes` and `content_type` | `services/image-cropper/app.py` |
| `image_crop_succeeded` | Image was successfully cropped; includes `output_width`, `output_height`, `confidence`, and `method` | `services/image-cropper/app.py` |
| `image_crop_failed` | Crop failed; includes `error_type` (`invalid_image` / `no_crop_area` / `processing_error`) and `file_size_bytes` | `services/image-cropper/app.py` |

## Next steps

We've built insights and a dashboard to monitor the image-cropper service:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/457362/dashboard/1678471)
- [Total Crops Processed (wizard)](https://us.posthog.com/project/457362/insights/7jhSSWKf) — Bold number for quick at-a-glance volume
- [Crop Volume Over Time (wizard)](https://us.posthog.com/project/457362/insights/YQ8kjl52) — Daily trend of crop requests
- [Crop Success Rate (wizard)](https://us.posthog.com/project/457362/insights/mU3fbZaQ) — `succeeded / requested × 100` formula chart
- [Crop Failures by Error Type (wizard)](https://us.posthog.com/project/457362/insights/2TrNP0MU) — Failures broken down by `error_type`
- [Average Crop Confidence (wizard)](https://us.posthog.com/project/457362/insights/6Mon5oBy) — Average OpenCV confidence score on successful crops

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-fastapi/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
