from rest_framework import serializers

from .models import LocationRecord


class LocationInputSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy = serializers.FloatField(required=False, allow_null=True, min_value=0)


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationRecord
        fields = ["id", "latitude", "longitude", "accuracy", "timestamp"]
