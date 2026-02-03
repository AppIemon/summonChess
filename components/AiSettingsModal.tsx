"use client";

import { useState } from 'react';
import styles from './AiSettingsModal.module.css';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (accuracy: number) => void;
}

export default function AiSettingsModal({ isOpen, onClose, onStart }: AiSettingsModalProps) {
  const [accuracy, setAccuracy] = useState(100);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalContent}>
        <h2 className={styles.title}>AI 대결 설정</h2>
        <p className={styles.subtitle}>AI의 지능 수준을 설정하고 대결을 시작하세요.</p>

        <div className={styles.difficultyControl}>
          <div className={styles.accuracyHeader}>
            <h3>AI 뇌 사용량</h3>
            <span className={styles.accuracyValue}>{accuracy}%</span>
          </div>

          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={accuracy}
              onChange={(e) => setAccuracy(parseInt(e.target.value))}
              className={styles.difficultySlider}
            />
            <div className={styles.sliderLabels}>
              <span>10% (초보)</span>
              <span>100% (천재)</span>
            </div>
          </div>

          <div className={styles.difficultyDescBox}>
            <p className={styles.difficultyDesc}>
              {accuracy <= 30 && "💡 컴퓨터가 아주 단순한 실수를 자주 합니다. 입문자에게 추천합니다."}
              {accuracy > 30 && accuracy <= 70 && "💡 컴퓨터가 적당한 지능으로 대결합니다. 즐거운 한 판이 될 것입니다."}
              {accuracy > 70 && accuracy < 100 && "💡 컴퓨터가 꽤 날카로운 수를 둡니다. 집중력이 필요합니다."}
              {accuracy === 100 && "💡 컴퓨터가 최선을 다해 승리를 노립니다. 도전을 환영합니다!"}
            </p>
          </div>
        </div>

        <div className={styles.buttonGroup}>
          <button className={styles.cancelButton} onClick={onClose}>취소</button>
          <button className={styles.startButton} onClick={() => onStart(accuracy)}>대결 시작!</button>
        </div>
      </div>
    </div>
  );
}
