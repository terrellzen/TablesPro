# Performance

The reference benchmark profile will generate one workspace, one base, multiple tables, and at least one 500,000-record table with 50 mixed-type fields.

Targets on documented local hardware:

- Warm indexed API grid requests for around 100 records: p95 below 300 ms.
- Warm single-record updates: p95 below 250 ms, excluding internet latency.
- Initial useful grid viewport: around 2 seconds locally.
- Mounted DOM rows and cells remain bounded by viewport and overscan.
- No normal endpoint serializes all 500,000 records into one JSON response.

The full benchmark is explicit and should not run in ordinary CI.
