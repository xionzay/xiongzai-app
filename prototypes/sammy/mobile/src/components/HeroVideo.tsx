import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useMotionEnabled } from './useMotionEnabled';

export function HeroVideo() {
  const enabled = useMotionEnabled();
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(require('../../assets/hero-loop.mp4'), video => {
    video.loop = true;
    video.muted = true;
  });

  useEffect(() => {
    setFailed(player.status === 'error');
    const subscription = player.addListener('statusChange', ({ status }) => {
      setFailed(status === 'error');
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (enabled && !failed) {
      player.playbackRate = 0.6;
      player.play();
    } else player.pause();
    // useVideoPlayer owns disposal; calling pause during unmount can hit a released player.
  }, [enabled, failed, player]);

  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.scene}>
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      allowsVideoFrameAnalysis={false}
      surfaceType="textureView"
      onFirstFrameRender={() => setRendered(true)}
    />
    {(!rendered || !enabled || failed) && <Image source={require('../../assets/hero-poster.jpg')} style={StyleSheet.absoluteFill} resizeMode="contain" />}
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#C5DFFA', overflow: 'hidden' },
});
