module Seek
  module Search
    module BackgroundReindexing
      def self.included(mod)
        mod.after_save(:queue_background_reindexing) if Seek::Config.solr_enabled
      end

      module InstanceMethods
        def queue_background_reindexing
          unless (saved_changes.keys - %w(updated_at last_used_at)).empty?
            Rails.logger.info("About to reindex #{self.class.name} #{id}")
            ReindexingJob.new.add_items_to_queue self
          end
        end
      end

      include InstanceMethods
    end
  end
end
