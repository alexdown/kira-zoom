import type { Question, DashboardAction } from '../types';
import { QuestionItem } from './QuestionItem';

interface QuestionListProps {
  questions: Question[];
  selectedQuestionId: string | null;
  dispatch: React.Dispatch<DashboardAction>;
}

export function QuestionList({ questions, selectedQuestionId, dispatch }: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🧠</div>
        <div className="empty-state-text">
          No questions yet. Upload a paper and generate questions.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="question-list">
        {questions.map((question, index) => (
          <QuestionItem
            key={question.id}
            question={question}
            index={index}
            isSelected={question.id === selectedQuestionId}
            dispatch={dispatch}
          />
        ))}
      </div>
      <button
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 8, width: '100%' }}
        onClick={() => {
          const newQ: Question = {
            id: `q_custom_${Date.now()}`,
            text: '',
            rationale: '',
            priority: questions.length + 1,
            status: 'ready',
          };
          dispatch({ type: 'MODAL_OPENED', modal: 'editQuestion', data: newQ.id });
          dispatch({ type: 'QUESTION_ADDED', question: newQ });
        }}
      >
        + Add Question
      </button>
    </div>
  );
}
