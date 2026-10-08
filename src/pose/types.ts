// 姿態資料的共同格式：鏡頭、影片、重播、標準動作都用這個格式，
// 後面的平滑、角度計算、步驟判定只認得這個格式，不直接碰 MediaPipe。

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 可信度 0～1（這個點有沒有被看清楚） */
  visibility: number;
}

export interface PoseFrame {
  /** 時間（毫秒） */
  t: number;
  /** 33 個關鍵點，影像座標：x、y 為 0～1（相對影像寬、高），順序見 landmarks.ts */
  landmarks: Landmark[];
  /** 33 個關鍵點的 3D 世界座標（公尺，以髖部中心為原點）。保留給未來 3D 角度使用 */
  world: Landmark[];
  /** 影像寬高（像素）。x、y 是相對值，算角度時要乘回寬高，才不會因長寬比而變形 */
  width: number;
  height: number;
}
