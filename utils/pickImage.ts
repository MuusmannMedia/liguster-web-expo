// utils/pickImage.ts
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Returnerer { previewUri, base64 } eller null hvis brugeren annullerer */
export async function pickAndPrepareImage(maxWidth = 1600, minQuality = 0.3) {
  // 1) Tilladelser
  const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (req.status !== "granted") return null;
  }

  // 2) Vælg billede
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false, // vi laver base64 efter resize for performance
    allowsEditing: false,
  });
  // Annulleret?
  if ((res as any)?.canceled) return null;

  const asset = (res as any)?.assets?.[0];
  if (!asset?.uri) return null;

  // 3) Resize + komprimer + bed om base64
  let quality = 0.7;
  let out = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  // Fallback: nogle platforme returnerer ikke base64 ved første hug
  if (!out.base64) {
    out = await ImageManipulator.manipulateAsync(
      out.uri,
      [],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
  }

  if (!out.base64) {
    // Hvis vi stadig ikke har base64, giver vi op (signalerer fejl opadtil)
    throw new Error("Kunne ikke læse billedet som Base64.");
  }

  return { previewUri: out.uri, base64: out.base64 };
}