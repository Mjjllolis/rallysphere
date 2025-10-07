import { StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { ResizeMode, Video } from 'expo-av'

const post = {
  id: 1,
  video: 'https://notjustdev-dummy.s3.us-east-2.amazonaws.com/vertical-videos/2.mp4'
}

const HomeFeed = () => {
  return (
    <View style={{flex: 1, backgroundColor: 'red'}} >
      <Stack.Screen options={{headerShown: false}} />
      <Video
        style={[StyleSheet.absoluteFill]}
        resizeMode={ResizeMode.CONTAIN}
        source={{uri: post.video}}
      />
    </View>
  )
}

export default HomeFeed

const styles = StyleSheet.create({})