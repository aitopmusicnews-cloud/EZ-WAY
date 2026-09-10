# Playlist update payload regression

This branch adds a regression test and narrows playlist PATCH payloads to the fields accepted by the AWS app-data contract. The test verifies database-managed fields such as `id` and `created_at` are never sent in playlist updates.
