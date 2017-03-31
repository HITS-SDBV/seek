class InvestigationsController < ApplicationController

  include Seek::IndexPager
  include Seek::DestroyHandling
  include Seek::AssetsCommon

  before_filter :find_assets, :only=>[:index]
  before_filter :find_and_authorize_requested_item,:only=>[:edit, :update, :destroy, :show,:new_object_based_on_existing_one]

  #project_membership_required_appended is an alias to project_membership_required, but is necesary to include the actions
  #defined in the application controller
  before_filter :project_membership_required_appended, :only=>[:new_object_based_on_existing_one]


  include Seek::Publishing::PublishingCommon

  include Seek::AnnotationCommon

  include Seek::BreadCrumbs

  include Seek::IsaGraphExtensions

  def new_object_based_on_existing_one
    @existing_investigation =  Investigation.find(params[:id])
    if @existing_investigation.can_view?
      @investigation = @existing_investigation.clone_with_associations
      render :action=>"new"
    else
      flash[:error]="You do not have the necessary permissions to copy this #{t('investigation')}"
      redirect_to @existing_investigation
    end

  end

  def show
    @investigation=Investigation.find(params[:id])
    @investigation.create_from_asset = params[:create_from_asset]
    options = {:is_collection=>false, :include=>['associated']}

    respond_to do |format|
      format.html
      format.xml
      format.rdf { render :template=>'rdf/show' }
      format.json {render json: JSONAPI::Serializer.serialize(@investigation,options)}

      format.ro do
        ro_for_download
      end

    end
  end

  def ro_for_download
    ro_file = Seek::ResearchObjects::Generator.new(@investigation).generate
    send_file(ro_file.path,
              type:Mime::Type.lookup_by_extension("ro").to_s,
              filename: @investigation.research_object_filename)
    headers["Content-Length"]=ro_file.size.to_s
  end

  def create

    # convert params as recieved by json-api to (flat) rails json
    if params.key?("data")
      params_new = params[:data][:attributes]
      project_titles = params[:meta][:project_titles]


      params[:investigation] = params_new

      # Projects
      params[:investigation][:project_ids] = []

      project_titles.each { |pr_ti|
        params[:investigation][:project_ids] << Project.where(title: pr_ti).first[:id].to_s
      }

      #Creators
      creators_arr = []
      params[:investigation][:creators].each { |cr|
        the_person = Person.where(email: cr).first
        creators_arr << the_person
      }
      params[:investigation][:creators] = creators_arr

    end

    @investigation=Investigation.new(params[:investigation])
    update_sharing_policies @investigation,params

    if @investigation.save
      update_scales(@investigation)
      update_relationships(@investigation, params)
       if @investigation.new_link_from_study=="true"
          render :partial => "assets/back_to_singleselect_parent",:locals => {:child=>@investigation,:parent=>"study"}
       else
        respond_to do |format|
          flash[:notice] = "The #{t('investigation')} was successfully created."
          if @investigation.create_from_asset=="true"
             flash.now[:notice] << "<br/> Now you can create new #{t('study')} for your #{t('assays.assay')} by clicking -Add a #{t('study')}- button".html_safe
            format.html { redirect_to investigation_path(:id=>@investigation,:create_from_asset=>@investigation.create_from_asset) }
          else
            format.html { redirect_to investigation_path(@investigation) }
            format.xml { render :xml => @investigation, :status => :created, :location => @investigation }
          end
        end
       end
    else
      respond_to do |format|
      format.html { render :action => "new" }
      format.xml { render :xml => @investigation.errors, :status => :unprocessable_entity }
    end
    end

  end

  def new
    @investigation=Investigation.new
    @investigation.create_from_asset = params[:create_from_asset]
    @investigation.new_link_from_study = params[:new_link_from_study]

    respond_to do |format|
      format.html
      format.xml { render :xml=>@investigation}
    end
  end

  def edit
    @investigation=Investigation.find(params[:id])

    respond_to do |format|
      format.html
    end
  end

  def update
    @investigation=Investigation.find(params[:id])

    @investigation.attributes = params[:investigation]

    update_sharing_policies @investigation,params

    respond_to do |format|
      if @investigation.save

        update_scales(@investigation)
        update_relationships(@investigation, params)

        flash[:notice] = "#{t('investigation')} was successfully updated."
        format.html { redirect_to(@investigation) }
        format.xml  { head :ok }
      else
        format.html { render :action => "edit" }
        format.xml  { render :xml => @investigation.errors, :status => :unprocessable_entity }
      end
    end
  end

  private

end
