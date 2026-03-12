from __future__ import annotations

from typing import Any, Dict, List


class MediaPipeHandsDetector:
    def __init__(self) -> None:
        import mediapipe as mp  # type: ignore[import-not-found]

        self._mp = mp
        self.hands = mp.solutions.hands.Hands(  # type: ignore[attr-defined]
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def detect_from_bgr(self, frame_bgr: Any) -> List[List[float]]:
        import cv2  # type: ignore[import-not-found]

        image_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self.hands.process(image_rgb)
        if not result.multi_hand_landmarks:
            return []
        hand = result.multi_hand_landmarks[0]
        return [[lm.x, lm.y, lm.z] for lm in hand.landmark]

    def classify_builtin_gesture(self, landmarks: List[List[float]]) -> str:
        if not landmarks:
            return "unknown"
        thumb_tip = landmarks[4][1]
        index_tip = landmarks[8][1]
        middle_tip = landmarks[12][1]
        ring_tip = landmarks[16][1]
        pinky_tip = landmarks[20][1]

        if thumb_tip < index_tip and index_tip < middle_tip:
            return "thumbs_up"
        if abs(index_tip - middle_tip) < 0.05 and ring_tip > middle_tip and pinky_tip > middle_tip:
            return "two_fingers"
        if index_tip > landmarks[5][1] and middle_tip > landmarks[9][1]:
            return "fist"
        if index_tip < landmarks[5][1] and middle_tip < landmarks[9][1] and ring_tip < landmarks[13][1]:
            return "open_palm"
        return "unknown"
