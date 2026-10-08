// MediaPipe Pose Landmarker 的 33 個關鍵點名稱。
// 陣列順序 = MediaPipe 輸出的索引（例如 leftShoulder 是第 11 個），不可改動順序。
// 注意：left / right 指的是「被拍的人自己的」左右，不是畫面的左右。
export const LANDMARK_NAMES = [
  'nose',
  'leftEyeInner',
  'leftEye',
  'leftEyeOuter',
  'rightEyeInner',
  'rightEye',
  'rightEyeOuter',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftPinky',
  'rightPinky',
  'leftIndex',
  'rightIndex',
  'leftThumb',
  'rightThumb',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
] as const;

// 由兩個關鍵點取中點算出來的「虛擬點」，方便定義軀幹角度。
export const VIRTUAL_POINTS = {
  midShoulder: ['leftShoulder', 'rightShoulder'],
  midHip: ['leftHip', 'rightHip'],
} as const satisfies Record<string, readonly [LandmarkName, LandmarkName]>;

export type LandmarkName = (typeof LANDMARK_NAMES)[number];
export type VirtualPointName = keyof typeof VIRTUAL_POINTS;
export type PointName = LandmarkName | VirtualPointName;

/** config/angles.json 裡可以使用的所有點名稱 */
export const POINT_NAMES = [
  ...LANDMARK_NAMES,
  ...(Object.keys(VIRTUAL_POINTS) as VirtualPointName[]),
] as [PointName, ...PointName[]];

export const POINT_LABELS: Record<PointName, string> = {
  nose: '鼻子',
  leftEyeInner: '左眼內側',
  leftEye: '左眼',
  leftEyeOuter: '左眼外側',
  rightEyeInner: '右眼內側',
  rightEye: '右眼',
  rightEyeOuter: '右眼外側',
  leftEar: '左耳',
  rightEar: '右耳',
  mouthLeft: '嘴巴左側',
  mouthRight: '嘴巴右側',
  leftShoulder: '左肩',
  rightShoulder: '右肩',
  leftElbow: '左手肘',
  rightElbow: '右手肘',
  leftWrist: '左手腕',
  rightWrist: '右手腕',
  leftPinky: '左小指',
  rightPinky: '右小指',
  leftIndex: '左食指',
  rightIndex: '右食指',
  leftThumb: '左拇指',
  rightThumb: '右拇指',
  leftHip: '左髖',
  rightHip: '右髖',
  leftKnee: '左膝',
  rightKnee: '右膝',
  leftAnkle: '左腳踝',
  rightAnkle: '右腳踝',
  leftHeel: '左腳跟',
  rightHeel: '右腳跟',
  leftFootIndex: '左腳尖',
  rightFootIndex: '右腳尖',
  midShoulder: '兩肩中點',
  midHip: '兩髖中點',
};

/** 這個點屬於身體哪一側（中點與臉部中線為 center） */
export function pointSide(name: PointName): 'left' | 'right' | 'center' {
  if (name.startsWith('left') || name === 'mouthLeft') return 'left';
  if (name.startsWith('right') || name === 'mouthRight') return 'right';
  return 'center';
}
