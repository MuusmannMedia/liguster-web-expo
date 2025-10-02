// hooks/usePermissions.ts
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export function usePermissions() {
  const askMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') throw new Error('Adgang til billeder afvist');
  };

  const askCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') throw new Error('Adgang til kamera afvist');
  };

  const askLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Adgang til lokation afvist');
  };

  return { askMedia, askCamera, askLocation };
}