
class Study < ActiveRecord::Base

  include Seek::Rdf::RdfGeneration
  include Seek::ProjectHierarchies::ItemsProjectsExtension if Seek::Config.project_hierarchy_enabled

  #FIXME: needs to be declared before acts_as_isa, else ProjectCompat module gets pulled in
  def projects
    investigation.try(:projects) || []
  end

  acts_as_isa

  attr_accessor :new_link_from_assay

  belongs_to :investigation
  has_many :assays
  belongs_to :person_responsible, :class_name => "Person"

  has_many :relationships,
           :class_name => 'Relationship',
           :as => :subject,
           :dependent => :destroy

  validates :investigation, :presence => true

  searchable(:auto_index => false) do
    text :experimentalists
    text :person_responsible do
      person_responsible.try(:name)
    end
  end if Seek::Config.solr_enabled

  ["data_file","sop","model","publication"].each do |type|
    eval <<-END_EVAL
      def #{type}_versions
        assays.collect{|a| a.send(:#{type}_versions)}.flatten.uniq
      end

      def #{type}s
        assays.collect{|a| a.send(:#{type}s)}.flatten.uniq
      end
    END_EVAL
  end

  def assets
    data_files + sops + models + publications
  end

  def project_ids
    projects.map(&:id)
  end

  def state_allows_delete? *args
    assays.empty? && super
  end

  def clone_with_associations
    new_object= self.dup
    new_object.policy = self.policy.deep_copy

    return new_object
  end

  def publications
    self.relationships.select {|a| a.other_object_type == "Publication"}.collect { |a| a.other_object }
  end

end
