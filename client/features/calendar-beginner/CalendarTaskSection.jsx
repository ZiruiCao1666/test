import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const getStyleWhen = (condition, style) => {
  if (!condition) {
    return null;
  }
  return style;
};

const noop = () => {};

const getTaskSaveButtonText = (editingTaskId, taskSaving) => {
  if (taskSaving) {
    return 'Saving...';
  }
  if (editingTaskId) {
    return 'Update task';
  }
  return 'Add task';
};

const formatTaskMeta = (task) => {
  const bits = [];
  if (task && task.taskDate) {
    bits.push(String(task.taskDate));
  }
  if (task && task.timingMode === 'range') {
    if (task.startTime && task.endTime) {
      bits.push(String(task.startTime) + ' - ' + String(task.endTime));
    }
  } else if (task && task.dueTime) {
    bits.push('Due ' + String(task.dueTime));
  }
  return bits.join(' | ');
};

const renderModeButton = ({ active, label, onPress }) => {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.modeButton, getStyleWhen(active, styles.modeButtonActive), getStyleWhen(pressed, styles.pressed)]}>
      <Text style={[styles.modeButtonText, getStyleWhen(active, styles.modeButtonTextActive)]}>{label}</Text>
    </Pressable>
  );
};

export default function CalendarTaskSection({
  visible = true,
  taskForm = {},
  editingTaskId = '',
  taskSaving = false,
  tasksError = '',
  customTasks = [],
  onTaskFieldChange = noop,
  onSubmitTask = noop,
  onResetTaskComposer = noop,
  onToggleTask = noop,
  onEditTask = noop,
  onDeleteTask = noop,
}) {
  if (!visible) {
    return null;
  }

  const safeTasks = Array.isArray(customTasks) ? customTasks : [];
  const safeTaskForm = taskForm || {};
  const showRangeFields = safeTaskForm.timingMode === 'range';

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>3. My Tasks</Text>

      <TextInput
        value={String(safeTaskForm.title || '')}
        onChangeText={(value) => onTaskFieldChange('title', value)}
        placeholder="Task name"
        style={styles.input}
      />

      <View style={styles.modeRow}>
        {renderModeButton({
          active: safeTaskForm.timingMode !== 'range',
          label: 'Deadline',
          onPress: () => onTaskFieldChange('timingMode', 'deadline'),
        })}
        {renderModeButton({
          active: safeTaskForm.timingMode === 'range',
          label: 'Time range',
          onPress: () => onTaskFieldChange('timingMode', 'range'),
        })}
      </View>

      <View style={styles.formRow}>
        <View style={styles.formColumn}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            value={String(safeTaskForm.taskDate || '')}
            onChangeText={(value) => onTaskFieldChange('taskDate', value)}
            placeholder="YYYY-MM-DD"
            style={styles.input}
          />
        </View>

        {!showRangeFields ? (
          <View style={styles.formColumn}>
            <Text style={styles.label}>Due time</Text>
            <TextInput
              value={String(safeTaskForm.dueTime || '')}
              onChangeText={(value) => onTaskFieldChange('dueTime', value)}
              placeholder="18:00"
              style={styles.input}
            />
          </View>
        ) : null}
      </View>

      {showRangeFields ? (
        <View style={styles.formRow}>
          <View style={styles.formColumn}>
            <Text style={styles.label}>Start</Text>
            <TextInput
              value={String(safeTaskForm.startTime || '')}
              onChangeText={(value) => onTaskFieldChange('startTime', value)}
              placeholder="09:00"
              style={styles.input}
            />
          </View>
          <View style={styles.formColumn}>
            <Text style={styles.label}>End</Text>
            <TextInput
              value={String(safeTaskForm.endTime || '')}
              onChangeText={(value) => onTaskFieldChange('endTime', value)}
              placeholder="10:00"
              style={styles.input}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable onPress={onSubmitTask} style={({ pressed }) => [styles.primaryButton, getStyleWhen(pressed, styles.pressed)]}>
          <Text style={styles.primaryButtonText}>{getTaskSaveButtonText(editingTaskId, taskSaving)}</Text>
        </Pressable>

        <Pressable onPress={onResetTaskComposer} style={({ pressed }) => [styles.secondaryButton, getStyleWhen(pressed, styles.pressed)]}>
          <Text style={styles.secondaryButtonText}>Reset</Text>
        </Pressable>
      </View>

      {tasksError ? <Text style={styles.error}>{tasksError}</Text> : null}

      <View style={styles.listWrap}>
        {safeTasks.length === 0 ? (
          <Text style={styles.empty}>No custom tasks yet.</Text>
        ) : (
          safeTasks.map((task, index) => {
            const taskId = String(task.id || task.title || 'task-' + String(index));
            return (
              <View key={taskId} style={styles.taskRow}>
                <View style={styles.taskTextWrap}>
                  <Text style={[styles.taskTitle, getStyleWhen(task.isCompleted, styles.taskTitleDone)]}>
                    {task.title || 'Untitled task'}
                  </Text>
                  <Text style={styles.taskMeta}>{formatTaskMeta(task)}</Text>
                </View>

                <View style={styles.actionRow}>
                  <Pressable onPress={() => onToggleTask(task)} style={({ pressed }) => [styles.smallButton, getStyleWhen(pressed, styles.pressed)]}>
                    <Text style={styles.smallButtonText}>{task.isCompleted ? 'Undo' : 'Done'}</Text>
                  </Pressable>

                  <Pressable onPress={() => onEditTask(task)} style={({ pressed }) => [styles.smallButton, getStyleWhen(pressed, styles.pressed)]}>
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </Pressable>

                  <Pressable onPress={() => onDeleteTask(task.id)} style={({ pressed }) => [styles.smallButtonDanger, getStyleWhen(pressed, styles.pressed)]}>
                    <Text style={styles.smallButtonDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  modeButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  modeButtonTextActive: {
    color: '#1d4ed8',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  formColumn: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: '#b91c1c',
  },
  listWrap: {
    marginTop: 16,
    gap: 12,
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  taskRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  taskTextWrap: {
    gap: 6,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6b7280',
  },
  taskMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  smallButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  smallButtonDanger: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
  },
  smallButtonDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },
  pressed: {
    opacity: 0.84,
  },
});
