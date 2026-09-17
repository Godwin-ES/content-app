export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json
          request_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json
          request_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_reviews: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          package_id: string
          request_id: string
          status: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          package_id: string
          request_id: string
          status?: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          package_id?: string
          request_id?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_reviews_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "approval_reviews_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_reviews_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          artifact_id: string
          base_article_version_id: string | null
          change_type: string
          content: Json
          content_hash: string
          content_plan_id: string | null
          created_at: string
          created_by: string | null
          id: string
          operation_run_id: string | null
          source_set_version_id: string
          version_number: number
        }
        Insert: {
          artifact_id: string
          base_article_version_id?: string | null
          change_type: string
          content: Json
          content_hash: string
          content_plan_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          operation_run_id?: string | null
          source_set_version_id: string
          version_number: number
        }
        Update: {
          artifact_id?: string
          base_article_version_id?: string | null
          change_type?: string
          content?: Json
          content_hash?: string
          content_plan_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          operation_run_id?: string | null
          source_set_version_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "content_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_base_article_version_id_fkey"
            columns: ["base_article_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_content_plan_id_fkey"
            columns: ["content_plan_id"]
            isOneToOne: false
            referencedRelation: "content_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "artifact_versions_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_source_set_version_id_fkey"
            columns: ["source_set_version_id"]
            isOneToOne: false
            referencedRelation: "source_set_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_artifacts: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          kind: string
          request_id: string
          slot: string | null
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          kind: string
          request_id: string
          slot?: string | null
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          kind?: string
          request_id?: string
          slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_artifacts_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_artifacts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packages: {
        Row: {
          article_evaluation_id: string
          article_version_id: string
          created_at: string
          created_by: string
          id: string
          linkedin_evaluation_id: string
          linkedin_version_id: string
          newsletter_evaluation_id: string
          newsletter_version_id: string
          request_id: string
          snapshot: Json
          snapshot_hash: string
          source_set_version_id: string
          version_number: number
          x_evaluation_id: string
          x_version_id: string
        }
        Insert: {
          article_evaluation_id: string
          article_version_id: string
          created_at?: string
          created_by: string
          id?: string
          linkedin_evaluation_id: string
          linkedin_version_id: string
          newsletter_evaluation_id: string
          newsletter_version_id: string
          request_id: string
          snapshot: Json
          snapshot_hash: string
          source_set_version_id: string
          version_number: number
          x_evaluation_id: string
          x_version_id: string
        }
        Update: {
          article_evaluation_id?: string
          article_version_id?: string
          created_at?: string
          created_by?: string
          id?: string
          linkedin_evaluation_id?: string
          linkedin_version_id?: string
          newsletter_evaluation_id?: string
          newsletter_version_id?: string
          request_id?: string
          snapshot?: Json
          snapshot_hash?: string
          source_set_version_id?: string
          version_number?: number
          x_evaluation_id?: string
          x_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_packages_article_evaluation_id_fkey"
            columns: ["article_evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_article_version_id_fkey"
            columns: ["article_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_packages_linkedin_evaluation_id_fkey"
            columns: ["linkedin_evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_linkedin_version_id_fkey"
            columns: ["linkedin_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_newsletter_evaluation_id_fkey"
            columns: ["newsletter_evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_newsletter_version_id_fkey"
            columns: ["newsletter_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_source_set_version_id_fkey"
            columns: ["source_set_version_id"]
            isOneToOne: false
            referencedRelation: "source_set_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_x_evaluation_id_fkey"
            columns: ["x_evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_x_version_id_fkey"
            columns: ["x_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_plans: {
        Row: {
          angle: string | null
          created_at: string
          created_by: string | null
          created_by_operation_run_id: string | null
          cta_direction: string | null
          id: string
          known_limitations: string | null
          links: Json
          primary_keyword: string
          request_id: string
          search_intent: string | null
          secondary_keywords: Json
          sections: Json
          source_set_version_id: string
          title: string
          version_number: number
        }
        Insert: {
          angle?: string | null
          created_at?: string
          created_by?: string | null
          created_by_operation_run_id?: string | null
          cta_direction?: string | null
          id?: string
          known_limitations?: string | null
          links?: Json
          primary_keyword: string
          request_id: string
          search_intent?: string | null
          secondary_keywords?: Json
          sections?: Json
          source_set_version_id: string
          title: string
          version_number: number
        }
        Update: {
          angle?: string | null
          created_at?: string
          created_by?: string | null
          created_by_operation_run_id?: string | null
          cta_direction?: string | null
          id?: string
          known_limitations?: string | null
          links?: Json
          primary_keyword?: string
          request_id?: string
          search_intent?: string | null
          secondary_keywords?: Json
          sections?: Json
          source_set_version_id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_plans_created_by_operation_run_id_fkey"
            columns: ["created_by_operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_plans_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_plans_source_set_version_id_fkey"
            columns: ["source_set_version_id"]
            isOneToOne: false
            referencedRelation: "source_set_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_requests: {
        Row: {
          additional_instructions: string | null
          created_at: string
          current_package_id: string | null
          current_plan_id: string | null
          current_source_set_id: string | null
          id: string
          owner_id: string
          publication_date: string | null
          resolved_audience: string
          resolved_cta: string | null
          resolved_objective: string
          resolved_primary_keyword: string | null
          resolved_tone: string
          selected_article_version_id: string | null
          source_urls: Json
          status: string
          supplied_audience: string | null
          supplied_cta: string | null
          supplied_objective: string | null
          supplied_primary_keyword: string | null
          supplied_sources_only: boolean
          supplied_tone: string | null
          test_model_choice: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          additional_instructions?: string | null
          created_at?: string
          current_package_id?: string | null
          current_plan_id?: string | null
          current_source_set_id?: string | null
          id?: string
          owner_id: string
          publication_date?: string | null
          resolved_audience: string
          resolved_cta?: string | null
          resolved_objective: string
          resolved_primary_keyword?: string | null
          resolved_tone: string
          selected_article_version_id?: string | null
          source_urls?: Json
          status?: string
          supplied_audience?: string | null
          supplied_cta?: string | null
          supplied_objective?: string | null
          supplied_primary_keyword?: string | null
          supplied_sources_only?: boolean
          supplied_tone?: string | null
          test_model_choice?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          additional_instructions?: string | null
          created_at?: string
          current_package_id?: string | null
          current_plan_id?: string | null
          current_source_set_id?: string | null
          id?: string
          owner_id?: string
          publication_date?: string | null
          resolved_audience?: string
          resolved_cta?: string | null
          resolved_objective?: string
          resolved_primary_keyword?: string | null
          resolved_tone?: string
          selected_article_version_id?: string | null
          source_urls?: Json
          status?: string
          supplied_audience?: string | null
          supplied_cta?: string | null
          supplied_objective?: string | null
          supplied_primary_keyword?: string | null
          supplied_sources_only?: boolean
          supplied_tone?: string | null
          test_model_choice?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_requests_current_package_id_fkey"
            columns: ["current_package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_requests_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "content_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_requests_current_source_set_id_fkey"
            columns: ["current_source_set_id"]
            isOneToOne: false
            referencedRelation: "source_set_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_requests_selected_article_version_id_fkey"
            columns: ["selected_article_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json
          created_at: string
          error_code: string | null
          id: string
          message: string
          request_id: string | null
          stage: string
        }
        Insert: {
          context?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          message: string
          request_id?: string | null
          stage: string
        }
        Update: {
          context?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          message?: string
          request_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          artifact_version_id: string
          claim_audit: Json
          created_at: string
          created_by: string | null
          criteria: Json
          deterministic_checks: Json
          id: string
          operation_run_id: string | null
          overall_status: string
          revision_instructions: string | null
          sections_needing_revision: Json
          unsupported_claims: Json
        }
        Insert: {
          artifact_version_id: string
          claim_audit?: Json
          created_at?: string
          created_by?: string | null
          criteria?: Json
          deterministic_checks?: Json
          id?: string
          operation_run_id?: string | null
          overall_status: string
          revision_instructions?: string | null
          sections_needing_revision?: Json
          unsupported_claims?: Json
        }
        Update: {
          artifact_version_id?: string
          claim_audit?: Json
          created_at?: string
          created_by?: string | null
          criteria?: Json
          deterministic_checks?: Json
          id?: string
          operation_run_id?: string | null
          overall_status?: string
          revision_instructions?: string | null
          sections_needing_revision?: Json
          unsupported_claims?: Json
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_artifact_version_id_fkey"
            columns: ["artifact_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "evaluations_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_attempts: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          event_type: string
          id: string
          request_id: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          request_id?: string | null
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_attempts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_runs: {
        Row: {
          attempt: number
          base_artifact_version_id: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_hash: string | null
          model: string | null
          operation_type: string
          provider: string | null
          request_id: string
          retry_safe: boolean
          stage: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempt?: number
          base_artifact_version_id?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          model?: string | null
          operation_type: string
          provider?: string | null
          request_id: string
          retry_safe?: boolean
          stage?: string | null
          started_at?: string | null
          status: string
        }
        Update: {
          attempt?: number
          base_artifact_version_id?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          model?: string | null
          operation_type?: string
          provider?: string | null
          request_id?: string
          retry_safe?: boolean
          stage?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_runs_base_artifact_version_id_fkey"
            columns: ["base_artifact_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "operation_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      publishing_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          queue_item_id: string
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          queue_item_id: string
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          queue_item_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishing_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "publishing_events_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "publishing_queue_items"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_queue_items: {
        Row: {
          channel: string
          channel_artifact_version_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          package_id: string
          request_id: string
          scheduled_at: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          channel_artifact_version_id: string
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          package_id: string
          request_id: string
          scheduled_at?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          channel_artifact_version_id?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          package_id?: string
          request_id?: string
          scheduled_at?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_queue_items_channel_artifact_version_id_fkey"
            columns: ["channel_artifact_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_queue_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "publishing_queue_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_queue_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sources: {
        Row: {
          author: string | null
          canonical_url: string | null
          content_hash: string | null
          created_at: string
          extracted_text: string | null
          id: string
          origin: string
          original_url: string | null
          published_at: string | null
          publisher: string | null
          request_id: string
          retrieval_error: string | null
          retrieval_status: string
          retrieved_at: string | null
          superseded_by_source_id: string | null
          supporting_material_id: string | null
          title: string | null
        }
        Insert: {
          author?: string | null
          canonical_url?: string | null
          content_hash?: string | null
          created_at?: string
          extracted_text?: string | null
          id?: string
          origin: string
          original_url?: string | null
          published_at?: string | null
          publisher?: string | null
          request_id: string
          retrieval_error?: string | null
          retrieval_status?: string
          retrieved_at?: string | null
          superseded_by_source_id?: string | null
          supporting_material_id?: string | null
          title?: string | null
        }
        Update: {
          author?: string | null
          canonical_url?: string | null
          content_hash?: string | null
          created_at?: string
          extracted_text?: string | null
          id?: string
          origin?: string
          original_url?: string | null
          published_at?: string | null
          publisher?: string | null
          request_id?: string
          retrieval_error?: string | null
          retrieval_status?: string
          retrieved_at?: string | null
          superseded_by_source_id?: string | null
          supporting_material_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sources_superseded_by_source_id_fkey"
            columns: ["superseded_by_source_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sources_supporting_material_id_fkey"
            columns: ["supporting_material_id"]
            isOneToOne: false
            referencedRelation: "supporting_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      source_conflicts: {
        Row: {
          created_at: string
          description: string
          id: string
          request_id: string
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_a_id: string
          source_b_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          request_id: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_a_id: string
          source_b_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          request_id?: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_a_id?: string
          source_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_conflicts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "source_conflicts_source_a_id_fkey"
            columns: ["source_a_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_conflicts_source_b_id_fkey"
            columns: ["source_b_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_evidence: {
        Row: {
          conservative_summary: string
          created_at: string
          evidence_key: string
          excerpt: string
          id: string
          limitations: Json
          source_analysis_run_id: string | null
          source_id: string
          supports: Json
        }
        Insert: {
          conservative_summary: string
          created_at?: string
          evidence_key: string
          excerpt: string
          id?: string
          limitations?: Json
          source_analysis_run_id?: string | null
          source_id: string
          supports?: Json
        }
        Update: {
          conservative_summary?: string
          created_at?: string
          evidence_key?: string
          excerpt?: string
          id?: string
          limitations?: Json
          source_analysis_run_id?: string | null
          source_id?: string
          supports?: Json
        }
        Relationships: [
          {
            foreignKeyName: "source_evidence_source_analysis_run_id_fkey"
            columns: ["source_analysis_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_review_decisions: {
        Row: {
          created_at: string
          decided_by: string
          decision: string
          id: string
          reason: string | null
          source_id: string
        }
        Insert: {
          created_at?: string
          decided_by: string
          decision: string
          id?: string
          reason?: string | null
          source_id: string
        }
        Update: {
          created_at?: string
          decided_by?: string
          decision?: string
          id?: string
          reason?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_review_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "source_review_decisions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_set_items: {
        Row: {
          id: string
          source_id: string
          source_set_version_id: string
        }
        Insert: {
          id?: string
          source_id: string
          source_set_version_id: string
        }
        Update: {
          id?: string
          source_id?: string
          source_set_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_set_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_set_items_source_set_version_id_fkey"
            columns: ["source_set_version_id"]
            isOneToOne: false
            referencedRelation: "source_set_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      source_set_versions: {
        Row: {
          confirmed_by: string
          created_at: string
          id: string
          request_id: string
          version_number: number
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          id?: string
          request_id: string
          version_number: number
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          id?: string
          request_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_set_versions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "source_set_versions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      supporting_materials: {
        Row: {
          classification: string
          content_hash: string | null
          created_at: string
          created_by: string
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string
          filename: string
          id: string
          mime_type: string
          request_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          classification?: string
          content_hash?: string | null
          created_at?: string
          created_by: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          filename: string
          id?: string
          mime_type: string
          request_id: string
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          classification?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          filename?: string
          id?: string
          mime_type?: string
          request_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporting_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supporting_materials_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      artifact_request_id: { Args: { p_artifact_id: string }; Returns: string }
      artifact_version_request_id: {
        Args: { p_artifact_version_id: string }
        Returns: string
      }
      cancel_queue_item: {
        Args: { p_queue_item_id: string; p_reason?: string }
        Returns: {
          channel: string
          channel_artifact_version_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          package_id: string
          request_id: string
          scheduled_at: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "publishing_queue_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_source_set: {
        Args: { p_request_id: string }
        Returns: {
          confirmed_by: string
          created_at: string
          id: string
          request_id: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "source_set_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_artifact_version: {
        Args: {
          p_artifact_id: string
          p_base_article_version_id?: string
          p_change_type?: string
          p_content?: Json
          p_content_hash?: string
          p_content_plan_id?: string
          p_expected_current_version_id?: string
          p_source_set_version_id?: string
        }
        Returns: {
          artifact_id: string
          base_article_version_id: string | null
          change_type: string
          content: Json
          content_hash: string
          content_plan_id: string | null
          created_at: string
          created_by: string | null
          id: string
          operation_run_id: string | null
          source_set_version_id: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "artifact_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_content_package: {
        Args: {
          p_article_evaluation_id: string
          p_article_version_id: string
          p_linkedin_evaluation_id: string
          p_linkedin_version_id: string
          p_newsletter_evaluation_id: string
          p_newsletter_version_id: string
          p_request_id: string
          p_snapshot: Json
          p_snapshot_hash: string
          p_x_evaluation_id: string
          p_x_version_id: string
        }
        Returns: {
          article_evaluation_id: string
          article_version_id: string
          created_at: string
          created_by: string
          id: string
          linkedin_evaluation_id: string
          linkedin_version_id: string
          newsletter_evaluation_id: string
          newsletter_version_id: string
          request_id: string
          snapshot: Json
          snapshot_hash: string
          source_set_version_id: string
          version_number: number
          x_evaluation_id: string
          x_version_id: string
        }
        SetofOptions: {
          from: "*"
          to: "content_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_queue_item: {
        Args: {
          p_channel: string
          p_channel_artifact_version_id: string
          p_idempotency_key: string
          p_package_id: string
          p_scheduled_at?: string
          p_timezone?: string
        }
        Returns: {
          channel: string
          channel_artifact_version_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          package_id: string
          request_id: string
          scheduled_at: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "publishing_queue_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_role_is: { Args: { target_role: string }; Returns: boolean }
      decide_package_review: {
        Args: {
          p_comment?: string
          p_decision: string
          p_package_id: string
          p_review_id: string
        }
        Returns: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          package_id: string
          request_id: string
          status: string
          submitted_at: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_draft_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      package_request_id: { Args: { p_package_id: string }; Returns: string }
      queue_item_request_id: {
        Args: { p_queue_item_id: string }
        Returns: string
      }
      request_owned_by_current_user: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      request_readable_by_current_user: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      request_visible_to_current_reviewer: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      reschedule_queue_item: {
        Args: {
          p_queue_item_id: string
          p_scheduled_at?: string
          p_timezone?: string
        }
        Returns: {
          channel: string
          channel_artifact_version_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          package_id: string
          request_id: string
          scheduled_at: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "publishing_queue_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      source_request_id: { Args: { p_source_id: string }; Returns: string }
      submit_package_for_review: {
        Args: { p_package_id: string; p_request_id: string }
        Returns: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          package_id: string
          request_id: string
          status: string
          submitted_at: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_package_review: {
        Args: { p_review_id: string }
        Returns: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          package_id: string
          request_id: string
          status: string
          submitted_at: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

