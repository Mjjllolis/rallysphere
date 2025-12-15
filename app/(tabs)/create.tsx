import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import CreateScreen from '../../components/CreateScreen';

export default function CreatePage() {
  const params = useLocalSearchParams();
  const initialType = (params.type as string) || 'Club';
  const [createModalVisible, setCreateModalVisible] = useState(true);

  const handleClose = () => {
    setCreateModalVisible(false);
    // Small delay to allow modal animation to complete before navigation
    setTimeout(() => {
      router.back();
    }, 100);
  };

  // Map URL parameter to CreateScreen type
  const getInitialType = (): 'Club' | 'Event' | 'Post' => {
    if (initialType.toLowerCase() === 'event') return 'Event';
    if (initialType.toLowerCase() === 'post') return 'Post';
    return 'Club';
  };

  return (
    <CreateScreen
      visible={createModalVisible}
      onClose={handleClose}
      initialType={getInitialType()}
    />
  );
}
