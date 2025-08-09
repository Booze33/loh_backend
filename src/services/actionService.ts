import { sendEmail } from '../controllers/integrations/gmail';
import { sendSlackMessage } from '../controllers/integrations/slack';
import { prisma } from '../utils/prisma';

interface Action {
  type: 'slack' | 'gmail' | 'calendar' | 'task' | 'reminder';
  payload: any;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  timestamp: string;
}

interface ActionResult {
  finalResponse: string;
  executedActions: Action[];
}

export const executeAction = async (
  aiResponse: string, 
  userId: string
): Promise<ActionResult> => {
  const actions: Action[] = [];
  let finalResponse = aiResponse;

  try {
    const actionPatterns = [
      /\[ACTION:(\w+)\](.*?)\[\/ACTION\]/gs,
      /ACTION_(\w+):\s*(\{[^}]*\})/gs,
      /Execute:\s*(\w+)\s*-\s*(.*?)(?=\n|$)/gs
    ];

    const detectedActions = new Set<string>();

    for (const pattern of actionPatterns) {
      const matches = [...aiResponse.matchAll(pattern)];
      
      for (const match of matches) {
        const [fullMatch, actionType, actionPayload] = match;
        const actionKey = `${actionType}-${actionPayload}`;

        if (detectedActions.has(actionKey)) continue;
        detectedActions.add(actionKey);

        const action: Action = {
          type: actionType.toLowerCase() as Action['type'],
          payload: {},
          status: 'pending',
          timestamp: new Date().toISOString()
        };

        try {
          let parsedPayload;
          try {
            parsedPayload = JSON.parse(actionPayload.trim());
          } catch {
            parsedPayload = parseNonJsonPayload(actionPayload.trim());
          }

          action.payload = parsedPayload;
          const result = await executeSpecificAction(action, userId);
          
          if (result.success) {
            action.status = 'success';
            action.payload = { ...action.payload, ...result.data };
            finalResponse = finalResponse.replace(fullMatch, '');

            const successMessage = getSuccessMessage(action);
            if (successMessage) {
              finalResponse += `\n✓ ${successMessage}`;
            }
          } else {
            action.status = 'failed';
            action.error = result.error;
            finalResponse = finalResponse.replace(fullMatch, `[Failed to execute ${actionType} action: ${result.error}]`);
          }

        } catch (error) {
          action.status = 'failed';
          action.error = error instanceof Error ? error.message : 'Unknown error';
          finalResponse = finalResponse.replace(fullMatch, `[Failed to execute ${actionType} action]`);
        }

        actions.push(action);
      }
    }

    if (actions.length > 0) {
      await logActionsToDatabase(userId, actions);
    }

  } catch (error) {
    console.error('Error in executeAction:', error);
  }

  return { 
    finalResponse: finalResponse.trim(), 
    executedActions: actions 
  };
};

const executeSpecificAction = async (
  action: Action, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    switch (action.type) {
      case 'slack':
        return await executeSlackAction(action.payload, userId);
      case 'gmail':
        return await executeGmailAction(action.payload, userId);
      case 'calendar':
        return await executeCalendarAction(action.payload, userId);
      case 'task':
        return await executeTaskAction(action.payload, userId);
      case 'reminder':
        return await executeReminderAction(action.payload, userId);
      default:
        return {
          success: false,
          error: `Unknown action type: ${action.type}`
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Action execution failed'
    };
  }
};

const executeSlackAction = async (
  payload: any, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const { channel, message, thread_ts } = payload;
    
    if (!channel || !message) {
      return { success: false, error: 'Missing required fields: channel and message' };
    }

    const result = await sendSlackMessage(userId, channel, message, thread_ts);

    return { 
      success: true, 
      data: { 
        channel, 
        messageId: result?.messageId,
        timestamp: result?.timestamp 
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Slack action failed'
    };
  }
};

const executeGmailAction = async (
  payload: any, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const { to, subject, body, cc, bcc } = payload;
    
    if (!to || !subject) {
      return { success: false, error: 'Missing required fields: to and subject' };
    }

    const result = await sendEmail(userId, to, subject, body, { cc, bcc });

    return { 
      success: true, 
      data: { 
        to, 
        subject,
        messageId: result?.messageId 
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gmail action failed'
    };
  }
};

const executeCalendarAction = async (
  payload: any, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const { title, startTime, endTime, attendees, description } = payload;
    
    if (!title || !startTime) {
      return { success: false, error: 'Missing required fields: title and startTime' };
    }
    
    return { 
      success: true, 
      data: { 
        title, 
        startTime,
        eventId: `cal_${Date.now()}` // placeholder
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Calendar action failed'
    };
  }
};

const executeTaskAction = async (
  payload: any, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const { title, description, dueDate, priority } = payload;
    
    if (!title) {
      return { success: false, error: 'Missing required field: title' };
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || '',
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || 'medium',
        userId,
        status: 'pending'
      }
    });
    
    return { 
      success: true, 
      data: { 
        taskId: task.id,
        title: task.title
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Task creation failed'
    };
  }
};

const executeReminderAction = async (
  payload: any, 
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const { message, reminderTime, type } = payload;
    
    if (!message || !reminderTime) {
      return { success: false, error: 'Missing required fields: message and reminderTime' };
    }

    const reminder = await prisma.reminder.create({
      data: {
        message,
        reminderTime: new Date(reminderTime),
        type: type || 'general',
        userId,
        status: 'active'
      }
    });
    
    return { 
      success: true, 
      data: { 
        reminderId: reminder.id,
        message: reminder.message
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reminder creation failed'
    };
  }
};

const parseNonJsonPayload = (payload: string): any => {
  const result: any = {};
  const pairs = payload.split(/[,\n]/).map(p => p.trim()).filter(p => p);
  
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split(':');
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      result[key.trim()] = value;
    }
  }
  
  return result;
};

const getSuccessMessage = (action: Action): string => {
  switch (action.type) {
    case 'slack':
      return `Slack message sent to ${action.payload.channel}`;
    case 'gmail':
      return `Email sent to ${action.payload.to}`;
    case 'calendar':
      return `Calendar event created: ${action.payload.title}`;
    case 'task':
      return `Task created: ${action.payload.title}`;
    case 'reminder':
      return `Reminder set: ${action.payload.message}`;
    default:
      return `${action.type} action completed`;
  }
};

const logActionsToDatabase = async (userId: string, actions: Action[]): Promise<void> => {
  try {
    await prisma.actionLog.createMany({
      data: actions.map(action => ({
        userId,
        actionType: action.type,
        status: action.status,
        payload: JSON.stringify(action.payload),
        error: action.error,
        timestamp: new Date(action.timestamp)
      }))
    });
  } catch (error) {
    console.error('Failed to log actions:', error);
  }
};