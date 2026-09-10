from pathlib import Path

app_data = Path('aws/app-data/template.yaml')
text = app_data.read_text()
old = """      CorsConfiguration:\n        CorsRules:\n          - AllowedOrigins:\n              - !Ref ProductionOrigin\n              - !Ref AmplifyOrigin\n            AllowedMethods:\n              - GET\n              - HEAD\n              - PUT\n            AllowedHeaders:\n              - '*'\n            ExposedHeaders:\n              - ETag\n            MaxAge: 3600\n"""
new = """      CorsConfiguration:\n        CorsRules:\n          - AllowedOrigins:\n              - '*'\n            AllowedMethods:\n              - GET\n              - HEAD\n              - PUT\n            AllowedHeaders:\n              - '*'\n            ExposedHeaders:\n              - ETag\n              - x-amz-request-id\n              - x-amz-id-2\n            MaxAge: 86400\n"""
if text.count(old) != 1:
    raise SystemExit(f'app-data CORS block match count was {text.count(old)}')
app_data.write_text(text.replace(old, new))

audio_tools = Path('aws/audio-tools/template.yaml')
text = audio_tools.read_text()
anchor = """      PublicAccessBlockConfiguration:\n        BlockPublicAcls: true\n        IgnorePublicAcls: true\n        BlockPublicPolicy: true\n        RestrictPublicBuckets: true\n      LifecycleConfiguration:\n"""
replacement = """      PublicAccessBlockConfiguration:\n        BlockPublicAcls: true\n        IgnorePublicAcls: true\n        BlockPublicPolicy: true\n        RestrictPublicBuckets: true\n      CorsConfiguration:\n        CorsRules:\n          - AllowedOrigins:\n              - '*'\n            AllowedMethods:\n              - GET\n              - HEAD\n              - PUT\n            AllowedHeaders:\n              - '*'\n            ExposedHeaders:\n              - ETag\n              - x-amz-request-id\n              - x-amz-id-2\n            MaxAge: 86400\n      LifecycleConfiguration:\n"""
if text.count(anchor) != 1:
    raise SystemExit(f'audio-tools CORS insertion anchor count was {text.count(anchor)}')
audio_tools.write_text(text.replace(anchor, replacement))

print('MEDIA_CORS_TEMPLATE_PATCH_OK')
